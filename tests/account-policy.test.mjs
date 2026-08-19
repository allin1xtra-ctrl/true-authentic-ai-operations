import test from "node:test";
import assert from "node:assert/strict";
import { passwordPolicyValid, safeReturnPath } from "../lib/account-policy.mjs";

test("password policy enforces 12 through 256 matching characters", () => {
  assert.equal(passwordPolicyValid("a".repeat(11), "a".repeat(11)), false);
  assert.equal(passwordPolicyValid("a".repeat(12), "a".repeat(12)), true);
  assert.equal(passwordPolicyValid("a".repeat(256), "a".repeat(256)), true);
  assert.equal(passwordPolicyValid("a".repeat(257), "a".repeat(257)), false);
  assert.equal(passwordPolicyValid("a".repeat(12), "b".repeat(12)), false);
});

test("return paths cannot redirect off-site", () => {
  assert.equal(safeReturnPath("/tasks?open=1"), "/tasks?open=1");
  assert.equal(safeReturnPath("//attacker.example"), "/");
  assert.equal(safeReturnPath("https://attacker.example"), "/");
});
