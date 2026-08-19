export function passwordPolicyValid(password, confirmation) {
  return password.length >= 12 && password.length <= 256 && password === confirmation;
}

export function verificationCodeFormatValid(code) {
  return /^\d{9}$/.test(code);
}

export function safeReturnPath(value) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
