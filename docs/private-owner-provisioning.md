# Private owner provisioning

The application has no public signup flow. Create the sole owner only from a private, trusted terminal with `DATABASE_URL` already present in the process environment:

```powershell
npm run owner:create
```

The command hides both password entries, initializes the standalone schema when it is absent, refuses redirected input, and stops without changing anything when a user already exists. Never paste the password, database URL, or generated credentials into chat, source control, or a browser form.
