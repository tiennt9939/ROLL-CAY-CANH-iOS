# ROLL CÂY CẢNH V26.2.92 — Employee PDF payroll attribution fix

## Baseline
- Based directly on source archive V26.2.91 (versionCode 143).
- New version: V26.2.92, versionCode 144.
- Android package remains `com.quanlycay.apk`.

## Root cause
`completedOrderRecords()` includes eligible PDF/daily-shipment reports in the canonical completed-order set. When Admin captures a PDF label on behalf of an assigned employee, the report stores the assigned worker in `adminDelegateAssignedUid`. `currentPackerCompletedRows()` previously filtered only `assignedUid`, `actorUid`, `completedBy`, and `uid`. For delegated PDF records those fields can be absent, so the worker's report rejected the record even though the Admin report included it. This caused employee/Admin daily wage totals to diverge.

## Change
- Added `adminDelegateAssignedUid` to the authoritative UID candidates in `currentPackerCompletedRows()`.
- This only makes the delegated report visible to the employee whose UID matches the saved assignment. It does not grant access to another employee's rows and does not create or recalculate wages.
- Existing wage eligibility remains authoritative: reports explicitly marked `wageRecorded: false` (Admin no-wage scans) are not inserted into payroll totals.
- Outside-order completion, assigned employee attribution, payroll formulas, Firestore schema/rules, inventory and shared PDF import remain unchanged.

## Verification
- `python3 tools/preflight.py`: PASS.
- All `tools/*_test.js`: 84/84 PASS, including new `v2692_employee_pdf_payroll_attribution_test.js`.
- Inline JavaScript syntax: 4/4 PASS.
- External `tiktok-label-import.js` syntax: PASS.
- ZIP integrity: verified after packaging.

## Limits
- No Gradle/APK build performed locally.
- Not live-tested against Firebase/Google Drive or on a physical phone.
- This patch fixes employee report attribution for Admin-delegated PDF scans; it does not retroactively change a report intentionally saved with `wageRecorded: false`. Such records must be audited before any wage correction to avoid paying Admin no-wage scans or double-counting.
