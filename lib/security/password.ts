export function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value) && value.length === 60;
}

export function validatePassword(value: string) {
  return value.length >= 10 && value.length <= 128;
}
