import { useSyncExternalStore } from 'react';
import type { MediaConnection } from 'peerjs';
import { net, VoiceMember } from './peer';

/**
 * Voice chat. Every pair of players in the call has its own direct audio link (nothing
 * goes through a server), and the host keeps the list of who is in the call. The mic is
 * only touched after the player presses Join.
 */

export interface VoiceSnapshot {
  status: 'off' | 'joining' | 'on';
  muted: boolean;
  /** Everyone in the call, whether or not we are. */
  members: VoiceMember[];
  /** Player ids talking right now. */
  speaking: ReadonlySet<string>;
  /** Peer ids whose audio has reached us. */
  linked: ReadonlySet<string>;
  /** Player ids this player has muted for themselves. */
  silenced: ReadonlySet<string>;
  error: { id: number; message: string } | null;
}

interface Call {
  media: MediaConnection;
  startedAt: number;
  audio: HTMLAudioElement | null;
}

interface Meter {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
  loudAt: number;
}

const HEAL_EVERY_MS = 4000;
/** A call with no audio after this long is dropped and dialled again. */
const CALL_STALL_MS = 20_000;
/** An offer nobody replied to was probably lost in a matchmaking-server blip: retry sooner. */
const OFFER_STALL_MS = 7000;
/** How long to hold a call from someone the room list hasn't told us about yet. */
const UNKNOWN_CALLER_MS = 8000;
const METER_EVERY_MS = 120;
const SPEAKING_LEVEL = 0.03;
const SPEAKING_HOLD_MS = 350;

const EMPTY: ReadonlySet<string> = new Set<string>();

function describeMicError(e: unknown): string {
  switch ((e as { name?: string })?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone is blocked. Allow it for this site in your browser, then join again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Your microphone is being used by another app. Close it and join again.';
    default:
      return 'Could not start your microphone.';
  }
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

class VoiceChat {
  private snapshot: VoiceSnapshot = { status: 'off', muted: false, members: [], speaking: EMPTY, linked: EMPTY, silenced: EMPTY, error: null };
  private listeners = new Set<() => void>();
  private playerId = '';
  private stream: MediaStream | null = null;
  private calls = new Map<string, Call>();
  private waiting = new Map<string, { call: MediaConnection; timer: ReturnType<typeof setTimeout> }>();
  private healTimer: ReturnType<typeof setInterval> | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private ctx: AudioContext | null = null;
  private meters = new Map<string, Meter>();
  /** Bumped so a mic prompt answered after the player left can't start a call. */
  private attempt = 0;
  private errorCount = 0;
  private retryingPlayback = false;

  constructor() {
    net.onVoiceRoster = (members) => {
      this.update({ members });
      this.reconcile();
    };
    net.onIncomingCall = (call) => this.incoming(call);
    // After a reconnect we have a new address, so tell the room again
    net.onLinkReady = () => {
      if (this.snapshot.status !== 'on') return;
      net.setVoiceState(this.playerId, true, this.snapshot.muted);
      this.reconcile();
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private update(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private fail(message: string) {
    this.errorCount += 1;
    this.update({ error: { id: this.errorCount, message } });
  }

  /* ------------------------------ join / leave ---------------------------- */

  /** Call from a click: browsers only allow audio to start from a user gesture. */
  async join(playerId: string) {
    if (this.snapshot.status !== 'off') return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.fail('Voice chat needs a secure link. Open the game from its https:// address.');
      return;
    }
    const attempt = ++this.attempt;
    this.playerId = playerId;
    this.update({ status: 'joining', muted: false });
    try {
      this.ctx = new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null; // only the "who's talking" lights need this; the call still works
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      if (attempt !== this.attempt) return;
      this.closeAudioContext();
      this.update({ status: 'off' });
      this.fail(describeMicError(e));
      return;
    }
    if (attempt !== this.attempt) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.stream = stream;
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (this.stream !== stream) return;
      this.leave();
      this.fail('Your microphone was disconnected.');
    });
    this.addMeter('me', stream);
    this.update({ status: 'on' });
    this.healTimer = setInterval(() => this.heal(), HEAL_EVERY_MS);
    this.meterTimer = setInterval(() => this.readMeters(), METER_EVERY_MS);
    net.setVoiceState(playerId, true, false);
    this.reconcile();
  }

  leave() {
    this.attempt += 1;
    if (this.snapshot.status === 'off') return;
    if (this.snapshot.status === 'on') net.setVoiceState(this.playerId, false, false);
    if (this.healTimer) clearInterval(this.healTimer);
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.healTimer = this.meterTimer = null;
    [...this.calls.keys()].forEach((peerId) => this.endCall(peerId));
    this.waiting.forEach(({ call, timer }) => {
      clearTimeout(timer);
      call.close();
    });
    this.waiting.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.meters.clear();
    this.closeAudioContext();
    this.update({ status: 'off', muted: false, speaking: EMPTY, linked: EMPTY });
  }

  private closeAudioContext() {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  toggleMute() {
    if (this.snapshot.status !== 'on') return;
    const muted = !this.snapshot.muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.update({ muted });
    net.setVoiceState(this.playerId, true, muted);
  }

  /** Mute one person for this player only. */
  toggleSilenced(playerId: string) {
    const silenced = new Set(this.snapshot.silenced);
    if (!silenced.delete(playerId)) silenced.add(playerId);
    this.update({ silenced });
    const member = this.snapshot.members.find((m) => m.playerId === playerId);
    const audio = member && this.calls.get(member.peerId)?.audio;
    if (audio) audio.muted = silenced.has(playerId);
  }

  /* --------------------------------- calls -------------------------------- */

  /** Makes the live calls match the room list. */
  private reconcile() {
    if (this.snapshot.status !== 'on' || !this.stream) return;
    const me = net.localPeerId;
    if (!me) return;
    const others = this.snapshot.members.filter((m) => m.peerId !== me);
    const present = new Set(others.map((m) => m.peerId));

    [...this.calls.keys()].forEach((peerId) => !present.has(peerId) && this.endCall(peerId));
    this.waiting.forEach(({ call, timer }, peerId) => {
      if (!present.has(peerId)) return;
      clearTimeout(timer);
      this.waiting.delete(peerId);
      this.answer(call);
    });
    // Exactly one side of each pair dials, so two people never call each other at once
    others.forEach((m) => {
      if (me < m.peerId && !this.calls.has(m.peerId)) this.dial(m.peerId);
    });
  }

  private dial(peerId: string) {
    if (!this.stream) return;
    const media = net.callPeer(peerId, this.stream);
    if (media) this.track(peerId, media);
  }

  private incoming(call: MediaConnection) {
    if (this.snapshot.status !== 'on') {
      call.close();
      return;
    }
    // Only people on the room's list can reach this mic. Their entry may still be on its way.
    if (this.snapshot.members.some((m) => m.peerId === call.peer)) {
      this.answer(call);
      return;
    }
    this.waiting.get(call.peer)?.call.close();
    const timer = setTimeout(() => {
      this.waiting.delete(call.peer);
      call.close();
    }, UNKNOWN_CALLER_MS);
    if (this.waiting.has(call.peer)) clearTimeout(this.waiting.get(call.peer)!.timer);
    this.waiting.set(call.peer, { call, timer });
  }

  private answer(call: MediaConnection) {
    if (!this.stream) return;
    if (this.calls.has(call.peer)) this.endCall(call.peer);
    this.track(call.peer, call);
    call.answer(this.stream);
  }

  private track(peerId: string, media: MediaConnection) {
    const entry: Call = { media, startedAt: Date.now(), audio: null };
    this.calls.set(peerId, entry);
    media.on('stream', (remote: MediaStream) => {
      if (this.calls.get(peerId) === entry) this.attach(peerId, entry, remote);
    });
    const gone = () => {
      if (this.calls.get(peerId) === entry) this.endCall(peerId);
    };
    media.on('close', gone);
    media.on('error', (err: unknown) => {
      console.warn('Bazaar: voice call error', err);
      gone();
    });
  }

  private attach(peerId: string, entry: Call, remote: MediaStream) {
    let audio = entry.audio;
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      entry.audio = audio;
    }
    const member = this.snapshot.members.find((m) => m.peerId === peerId);
    audio.muted = !!member && this.snapshot.silenced.has(member.playerId);
    audio.srcObject = remote;
    audio.play().catch(() => this.retryPlaybackOnTap());
    this.addMeter(peerId, remote);
    this.update({ linked: new Set([...this.snapshot.linked, peerId]) });
  }

  /** If the browser refused to start the sound, try again on the player's next tap. */
  private retryPlaybackOnTap() {
    if (this.retryingPlayback) return;
    this.retryingPlayback = true;
    window.addEventListener(
      'pointerdown',
      () => {
        this.retryingPlayback = false;
        void this.ctx?.resume();
        this.calls.forEach((c) => c.audio?.play().catch(() => undefined));
      },
      { once: true }
    );
  }

  private endCall(peerId: string) {
    const entry = this.calls.get(peerId);
    if (!entry) return;
    this.calls.delete(peerId);
    entry.media.close();
    if (entry.audio) {
      entry.audio.srcObject = null;
      entry.audio.remove();
    }
    this.removeMeter(peerId);
    if (this.snapshot.linked.has(peerId)) {
      const linked = new Set(this.snapshot.linked);
      linked.delete(peerId);
      this.update({ linked });
    }
  }

  /** Regularly drops calls that never connected and re-dials anyone missing. */
  private heal() {
    const now = Date.now();
    [...this.calls.entries()].forEach(([peerId, call]) => {
      const unanswered = call.media.peerConnection?.signalingState === 'have-local-offer';
      if (!call.audio && now - call.startedAt > (unanswered ? OFFER_STALL_MS : CALL_STALL_MS)) this.endCall(peerId);
    });
    this.reconcile();
  }

  /* --------------------------- who's talking lights ----------------------- */

  private addMeter(key: string, stream: MediaStream) {
    if (!this.ctx || this.meters.has(key)) return;
    try {
      const source = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // not to the speakers: remote audio already plays through its <audio>
      this.meters.set(key, { source, analyser, buffer: new Uint8Array(analyser.fftSize), loudAt: 0 });
    } catch (e) {
      console.warn('Bazaar: voice level meter unavailable', e);
    }
  }

  private removeMeter(key: string) {
    this.meters.get(key)?.source.disconnect();
    this.meters.delete(key);
  }

  private readMeters() {
    const now = Date.now();
    const speaking = new Set<string>();
    this.meters.forEach((meter, key) => {
      meter.analyser.getByteTimeDomainData(meter.buffer);
      let sum = 0;
      for (const v of meter.buffer) sum += ((v - 128) / 128) ** 2;
      if (Math.sqrt(sum / meter.buffer.length) > SPEAKING_LEVEL) meter.loudAt = now;
      if (now - meter.loudAt >= SPEAKING_HOLD_MS) return;
      if (key === 'me') {
        if (!this.snapshot.muted) speaking.add(this.playerId);
        return;
      }
      const member = this.snapshot.members.find((m) => m.peerId === key);
      if (member && !member.muted) speaking.add(member.playerId);
    });
    if (!sameSet(speaking, this.snapshot.speaking)) this.update({ speaking });
  }
}

export const voice = new VoiceChat();

export function useVoice(): VoiceSnapshot {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot);
}
