# Sakani — how the business makes money

*Draft, updated 25 October 2026. All figures are planning assumptions to test, not results.*

## The model in one line
Sakani is the trusted middleman. Students contact the **Sakani team**, not the owner. The team checks the owner, arranges the visit and, when the home is rented, collects a **one-time service fee from both sides**:
- **Owner:** 20% of one month's rent (minimum set in **Admin → Payments**).
- **Student:** 10% of one month's rent, minimum 200 EGP.

Rent and deposit go from student to owner directly. Sakani only collects its own fees, by InstaPay or Vodafone Cash.

**Why owners accept it:**
- Listing is free, and they pay nothing until a student rents.
- Sakani brings checked students and arranges visits.
- Brokers often charge a large share of a month's rent or a full month.

**Why students accept it:**
- Asking and visiting are free.
- Owners are checked before the visit, and fake listings are filtered out.
- The fee is small next to a broker's commission.

**Why it protects your income:** owner numbers are private, so a student can't skip Sakani and call the owner directly. Every rental goes through **Admin → Requests**.

## Revenue streams, in the order to switch them on
| When | Stream | Price (starting point) | Notes |
|---|---|---|---|
| Now (built) | Owner success fee | 20% of 1 month (minimum in admin) | Created when you mark a request **Rented**. |
| Now (built) | Student service fee | 10% of 1 month, min 200 EGP | Created at the same time; collected by the team. |
| After ~50 live listings | Featured listing | 150 EGP / week, 400 EGP / month | Top of results with a "Featured" label. Same InstaPay/Vodafone Cash flow. |
| After ~100 listings | Paid verification visit | 250 EGP per visit | Owner pays for the "Verified" badge. The badge stays honest: the visit and checklist are still required. |
| Year 2 | Pro plan for residences and dorm operators (5+ homes) | 750–1,500 EGP / month | Unlimited featured slots, monthly stats, a priority verification visit. |
| Year 2 | Partner referrals | Commission | Furniture rental, moving, internet, student insurance. Shown only on listing and saved pages. |

## Example year in Giza (assumptions)
- An average home is 3,000 EGP/month, so one rental brings about **600 EGP from the owner + 300 EGP from the student = 900 EGP**.
- Rentals reported through Sakani:

  | Period | Rentals | Revenue |
  |---|---|---|
  | First term (Nov–Feb) | 40 | ≈ 36,000 EGP |
  | Summer peak (Jul–Oct) | 200 | ≈ 180,000 EGP |
  | **Year 1 total** | **≈ 300** | **≈ 270,000 EGP from both fees** |

- Featured listings add about 20 owners × 400 EGP × 6 months ≈ **48,000 EGP**.
- Running costs:
  - domain about 600 EGP/year;
  - Vercel and Supabase free at first, then about $45/month once traffic grows;
  - marketing budget as you decide.

## Making sure fees get paid (leakage)
Owners could rent to a Sakani student and not report it. Ways to reduce this:
1. **Keep the fee low.** At 20%, paying is easier than lying.
2. **Built into the site:**
   - an overdue fee (14+ days) blocks new listings;
   - **Admin → "Rented via Sakani: add fee"** for rentals students tell you about;
   - the WhatsApp button on each fee to remind the owner.
3. **Next to build:** a short "Did you rent this home?" question for students who contacted an owner, which flags rentals that weren't reported.
4. Personal follow-up: call owners whose listing got many WhatsApp clicks and then went "Rented".

## Growth calendar
- **Now → November.** Supply first:
  - 50+ listings near Cairo University, Ain Shams and October 6 University;
  - verify the first 10;
  - post the flyer and WhatsApp message (Admin → Grow).
- **December → February.** Second-term push for students:
  - university Facebook groups and student unions;
  - a "share Sakani" message;
  - turn on Featured listings.
- **March → June.**
  - Expand to new areas (Nasr City / Al-Azhar, Alexandria).
  - Sign up dorm operators for the Pro plan.
- **July → October.** The big season. Most revenue arrives here, so the site should be packed with verified listings by July.

## Numbers to watch every week
- Live listings, and verified listings.
- WhatsApp clicks per listing (Admin cards and owner stats).
- Rentals reported, and the share reported as "through Sakani".
- Fee collection rate: paid ÷ due (target over 80%).
- Cost per new listing and per new student visitor.

## Before collecting money at scale
- **Register the business:**
  - commercial register and tax card;
  - a business InstaPay / bank account, since personal accounts have transfer limits;
  - receipts, and e-invoicing once registered.

  Ask an accountant.
- **Have the Privacy Policy and Terms reviewed by a lawyer.** They now describe the success fee.
- **Later, add a gateway for automatic payments** (e.g. Paymob: cards and wallets). It needs a registered business.
