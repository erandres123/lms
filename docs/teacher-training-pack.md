# Teacher training pack (pilot)

Audience: Grade 7 teachers and the school administrator who supports them.
Duration: 90 minutes, plus a 15-minute optional device clinic.
Outcome: every teacher can take attendance (online and offline), record grades, run a live class, and explain the privacy basics to a parent.

This pack is training material only. It is not the school's privacy notice, DPA, or retention policy; those must be supplied and signed by the school.

## Before the session (admin, 20 minutes)

- [ ] Confirm every teacher has an account and can sign in to the web app (`/`) and the mobile app.
- [ ] Confirm each teacher has the pilot section(s) in their schedule.
- [ ] Replace the placeholder privacy notice in **Privacy** with the school's approved text and save it (this creates version 1).
- [ ] Decide the guardian account mode in **Privacy → Guardian accounts** and write it on the board:
  - Admin-created (default): you create the account and hand over a one-time password in person.
  - Email invite: the guardian receives an email and sets their own password.
  - Magic link: the guardian signs in from an emailed link, no password.
- [ ] Link at least one guardian to one student so the parent flow can be demonstrated.
- [ ] Have two devices: a laptop for the web app and a phone/tablet for offline marking.
- [ ] Print the one-page cheat sheet at the end of this document.

## Agenda

| Minutes | Topic | Format |
| --- | --- | --- |
| 0–10 | Why we are piloting; what changes for teachers this term | Talk |
| 10–25 | Sign-in, schedule, and finding your section | Demo + hands-on |
| 25–45 | Attendance: web and offline mobile, sync and conflicts | Demo + hands-on |
| 45–60 | Grades and the SF9 draft export | Demo |
| 60–70 | Live class: start, admit, end; what students see | Demo |
| 70–80 | Privacy: notice, guardian consent, what to tell parents | Talk + script |
| 80–88 | Practice scenario: offline morning, then correct a record | Paired exercise |
| 88–90 | Support, escalation, and the weekly check-in | Talk |

## 1. Sign in and orient (15 minutes)

1. Open the web app and sign in with the school email and password.
2. The left side is the gradebook: **Gradebook**, **Attendance**, **Roster**, **Competencies**, **Live**, **Inbox**, then admin-only **Audit**, **Privacy**, **Retention**.
3. Pick a section and a grading period. The table shows learners, written work, performance tasks, initial and transmuted grades.
4. On mobile, the bottom tabs are **Schedule**, **Inbox**, and **Profile**. Tap a section to open Meetings, Grades, and Attendance.

Say this: accounts are created by the school administrator; there is no self-registration for staff or students.

## 2. Attendance (20 minutes)

### Web

1. Open the section → **Attendance** tab.
2. Pick the date, mark each learner Present / Absent / Late / Excused, then **Save attendance**.
3. Saved rows show the status and a version number (for example `Present · v2`).

### Mobile, including offline

1. Open the section → **Attendance** tab on the phone.
2. Mark the class, then **Save attendance**.
3. If the phone has no signal, the app says **Saved on this device. It will sync when you are back online.** The date is locked while the sheet is queued so it cannot be queued twice.
4. When signal returns, open the same date and tap **Sync now**, or just save the next sheet; queued sheets flush automatically.
5. If someone else saved a newer version first, an **Attendance conflicts** card appears. Tap **Reload** to accept the server version and re-mark. Never re-enter the same sheet twice hoping it will overwrite; the conflict card is the correct path.

Rule of thumb: the server keeps the newest version; the queue is exactly-once and safe to retry.

## 3. Grades and the SF9 draft (15 minutes)

1. **Gradebook** → choose section and period.
2. Enter scores for each item. Blank is not zero; leave it blank until the learner submits.
3. Save. The initial and transmuted grades update for the period.
4. **SF9 draft (XLSX)** downloads a spreadsheet for checking. It is labelled draft because the official layout is waiting on the registrar's form sample. Do not submit it as an official card.

Overrides are for documented cases only: record the reason in the override field so the audit trail explains it.

## 4. Live class (10 minutes)

1. Teacher: section → **Live** → start the meeting, then **Join**.
2. Students see the meeting on their section screen and join from there; a learner who is not enrolled cannot join.
3. Recording is off by default. Do not record without the school's approval and the notice covering it.
4. End the meeting from the teacher controls when class is over. Students cannot keep the room open.

## 5. Privacy and guardian consent (10 minutes)

What teachers may say to a parent:

> "The school's privacy notice is in the app under Profile → Privacy notice. You can also consent for your child from the Consent screen once the office links your account. If you want a copy of your child's data or want to ask about deletion, contact the school office; the administrator has an export and a deletion preview."

What teachers must not do:

- Do not collect consent verbally and promise it is recorded; consent must be captured in the app against the published notice version.
- Do not share screenshots of grades, attendance, or the inbox outside the school's approved channels.
- Do not create guardian accounts yourself. Ask the administrator; the account mode is an admin decision.

Admin demonstration (5 minutes inside this block):

1. **Privacy** → show the notice version chip and that editing creates a new version.
2. **Guardian accounts** → show the mode, create or link one guardian, and note that a one-time password is shown once and never stored.
3. **Privacy → Consent history** → show who recorded consent, when, and against which notice version.
4. **Audit** → filter by `privacy.` to show the trail the school can rely on.

## 6. Paired exercise (8 minutes)

One teacher pretends the Wi-Fi is down:

1. Mark the class on the phone and save. Confirm the queued message.
2. Turn Wi-Fi back on, tap **Sync now**, and confirm **Synced 1 sheet.**
3. On the laptop, change one learner to Late and save.
4. On the phone, try to change that learner again and force a conflict; use **Reload** to recover.

## 7. Support and escalation (2 minutes)

Fill this in with the school before training; do not leave it verbal:

| Situation | Who to contact | How | Response target |
| --- | --- | --- | --- |
| Cannot sign in | [school IT contact] | [channel] | [same day] |
| Grades or attendance look wrong | [registrar/academic head] | [channel] | [same day] |
| Suspected data exposure or wrong recipient | [data protection officer] | [channel + phone] | [immediate] |
| App error or outage | [pilot support contact] | [channel] | [same day] |

Weekly check-in: one 15-minute slot with the champion teacher to review conflicts, queued sheets, and any parent questions.

## One-page cheat sheet

Print this page and keep it at the teacher's desk.

### Sign in
- Web: school email + password. Mobile: same account.
- No account? Ask the administrator. Staff do not self-register.

### Attendance
- Section → Attendance → pick date → mark → **Save attendance**.
- Offline: save anyway. The sheet is queued on the device.
- Back online: **Sync now** (or save the next sheet).
- Conflict card: **Reload**, then re-mark. Never fight the queue.

### Grades
- Gradebook → section → period → enter scores → save.
- Blank means "not submitted", not zero.
- SF9 XLSX is a **draft** for checking, not an official report card.

### Live class
- Section → Live → start → Join.
- Only enrolled learners can join.
- Do not record without approval; end the meeting when done.

### Privacy
- Notice lives in the app: Profile → Privacy notice.
- Guardian consent is captured in-app against the notice version.
- Parents asking for a copy or deletion: refer to the school office.
- No screenshots of learner data outside approved channels.

### When something is wrong
1. Do not re-enter the same data repeatedly.
2. Note the date, section, learner, and what you saw.
3. Contact the person on the support table.
4. For suspected data exposure, call the data protection officer immediately.

### Session sign-off

| Teacher | Account works | Attendance (online) | Attendance (offline + sync) | Grades | Live class | Privacy basics |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |

Sign-off records attendance at training, not legal consent or policy approval.
