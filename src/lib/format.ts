export function formatVnd(amount: number): string {
  return `${Math.round(amount / 1000) * 1000}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
