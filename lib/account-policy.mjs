export function passwordPolicyValid(password, confirmation) {
  return password.length >= 12 && password.length <= 256 && password === confirmation;
}

export function safeReturnPath(value) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
