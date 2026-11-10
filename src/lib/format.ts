/**
 * Formats a currency value directly in classic Indian Rupees (₹)
 * e.g. 1500 -> ₹1,500, 240 -> ₹240, 60 -> ₹60
 */
export function formatINR(amount: number, compact: boolean = false): string {
  if (compact) {
    if (Math.abs(amount) >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
    }
    if (Math.abs(amount) >= 100000) {
      return `₹${(amount / 100000).toFixed(1).replace(/\.0$/, '')}L`;
    }
    if (Math.abs(amount) >= 1000) {
      return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return `₹${amount}`;
  }

  // Classic clean currency format: e.g. ₹1,500, ₹240, ₹60
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatTeamName(teamId?: string): string {
  if (!teamId) return '';
  switch (teamId) {
    case 'team-1':
      return 'Team Red';
    case 'team-2':
      return 'Team Blue';
    case 'team-3':
      return 'Team Green';
    case 'team-4':
      return 'Team Yellow';
    default:
      return teamId.toUpperCase();
  }
}

export function getTeamColor(teamId?: string): string {
  switch (teamId) {
    case 'team-1':
      return '#EF4444'; // Red
    case 'team-2':
      return '#3B82F6'; // Blue
    case 'team-3':
      return '#10B981'; // Green
    case 'team-4':
      return '#F59E0B'; // Yellow
    default:
      return '#64748B';
  }
}
