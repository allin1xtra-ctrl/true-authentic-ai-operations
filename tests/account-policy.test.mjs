import test from "node:test";
import assert from "node:assert/strict";
import { passwordPolicyValid, safeReturnPath, verificationCodeFormatValid } from "../lib/account-policy.mjs";

test("password policy enforces 12 through 256 matching characters", () => {
  assert.equal(passwordPolicyValid("a".repeat(11), "a".repeat(11)), false);
  assert.equal(passwordPolicyValid("a".repeat(12), "a".repeat(12)), true);
  assert.equal(passwordPolicyValid("a".repeat(256), "a".repeat(256)), true);
  assert.equal(passwordPolicyValid("a".repeat(257), "a".repeat(257)), false);
  assert.equal(passwordPolicyValid("a".repeat(12), "b".repeat(12)), false);
});

test("verification codes are exactly nine ASCII digits", () => {
  assert.equal(verificationCodeFormatValid("123456789"), true);
  for (const invalid of ["12345678", "1234567890", "12345x789", "１２３４５６７８９", ""]) assert.equal(verificationCodeFormatValid(invalid), false);
});

test("return paths cannot redirect off-site", () => {
  assert.equal(safeReturnPath("/tasks?open=1"), "/tasks?open=1");
  assert.equal(safeReturnPath("//attacker.example"), "/");
  assert.equal(safeReturnPath("https://attacker.example"), "/");
});
