# Aurivest Backend

Node/Express + MongoDB API for the Aurivest banking and investment platform.
Serves both the client app (`invandbankfrontend`) and the admin panel (`invandbankadmin`).

## Running it

```bash
npm install
```

```bash
npm run dev
```

Defaults to port 5000. `.env` needs at minimum `MONGO_URI` and `JWT_SECRET` — see `.env.example`.

Seed a demo client with a realistic history:

```bash
npm run seed
```

That creates `demo@aurivest.com` / `demo1234` with three funded accounts, cards, mandates,
a loan and a ledger. It refuses to run when `NODE_ENV=production`.

### Creating the first admin

Set `SEED_ADMIN=true` plus `ADMIN_EMAIL` and `ADMIN_PASSWORD` (10+ characters) in `.env`,
start the server once, then set `SEED_ADMIN=false`. The seed is skipped rather than falling
back to a default password — a guessable admin login on a banking API is not an acceptable default.

## Data model

| Model | Holds |
| --- | --- |
| `User` | Identity, role, KYC, earnings wallet, referral links |
| `Account` | Checking / savings / investment. **All spendable money lives here**, never on the user |
| `Transaction` | The ledger. Signed amounts; positive credits, negative debits |
| `Investment` | A mandate subscription; rate and term copied in at subscription time |
| `Loan` | Credit applications and active facilities |
| `Card` | Payment cards — last four digits only, never a full PAN |
| `Beneficiary` | Saved external recipients |
| `PaymentMethod` | Admin-managed funding rails |
| `SupportMessage` | Client tickets |
| `Setting` | Platform singleton: limits, bonus, referral reward |

## Money rules

These live in `utils/banking.js` and every route goes through them:

- **Every balance change writes a ledger row.** `credit()` and `debit()` do both together.
- **No overdrafts.** `debit()` refuses to take a balance below zero.
- **Rounded to the cent on every write** — repeated float credits drift otherwise.
- **Pending deposits do not move the balance.** Approving one is what credits it.
- **Pending withdrawals and outbound transfers hold the funds immediately**, so the same
  balance can't be withdrawn twice. Rejecting one refunds it and writes a reversal row.
- **Bonus and earnings sweeps flip atomically** (`findOneAndUpdate` on a guard condition)
  so a double-click cannot pay twice.

## Access control (`middleware/auth.js`)

| Guard | Requires |
| --- | --- |
| `protect` | Valid token, active account, verified email (admins exempt) |
| `admin` | `role: 'admin'` |
| `kycSubmitted` | KYC at least submitted — deposits, transfers, investments, loan applications |
| `kycVerified` | KYC **approved** — withdrawals and outbound external transfers |

## Routes

```
/api/auth          register, login, verify-email, resend-code, me
/api/settings      public limits and bonus config
/api/users         profile, password, claim-bonus, transfer-profit
/api/kyc           submit, skip, status
/api/dashboard     overview (balances, series, holdings, activity)
/api/accounts      list, transfer (internal + external), beneficiaries
/api/cards         list, issue virtual, freeze, limit, delete
/api/investments   plans, subscribe, list, close
/api/portfolio     net worth, mandates, accruals
/api/transactions  the client's ledger
/api/deposits      methods, submit
/api/withdrawals   methods, submit
/api/loans         products, apply, list
/api/referrals     code, link, rewards
/api/support       tickets
/api/admin         stats, clients, approvals, KYC, loans, mandates,
                   payment methods, support, settings
```

## Notes and limits

- **Balance changes are not transactional across documents.** MongoDB multi-document
  transactions need a replica set; Atlas provides one, so wrapping `credit`/`debit` pairs
  in a session is the natural next step before real money is involved.
- **Card numbers are illustrative.** Real issuance goes through a processor; store its
  token and nothing else.
- **Rates in `config/constants.js` are placeholders.** They must match the marketing site,
  and both need compliance review before launch.
- **Email degrades safely.** Without SMTP config, messages are logged rather than sent,
  and a failed send never fails the request that triggered it.
