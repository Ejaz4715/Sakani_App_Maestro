// Applicant age in completed HIJRI years, from the read-only Date of Birth that PRE shows on the
// registration "Personal information" screen (e.g. "1405-4-18" = year-month-day, Hijri).
// Input  : output.applicantDobHijri (string)
// Output : output.applicantAgeHijri (number, -1 when the date cannot be read)
//          output.todayHijri        (string "Y-M-D", for the log)
// Today is converted with the arithmetic (tabular) Islamic calendar; it can differ from Umm al-Qura
// by a day or two, which only matters for a birthday within two days of the minimum-age boundary.
// A Gregorian-looking DOB (year > 1700) is converted to Hijri the same way before comparing.
function toJulianDay(y, m, d) {
  var a = Math.floor((14 - m) / 12);
  var yy = y + 4800 - a;
  var mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
function julianDayToHijri(jd) {
  var l = jd - 1948440 + 10632;
  var n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  var m = Math.floor((24 * l) / 709);
  var d = l - Math.floor((709 * m) / 24);
  var y = 30 * n + j - 30;
  return [y, m, d];
}
var now = new Date();
var today = julianDayToHijri(toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate()));
output.todayHijri = today.join('-');
output.applicantAgeHijri = -1;
var parts = String(output.applicantDobHijri || '').match(/([0-9]{4})\D+([0-9]{1,2})\D+([0-9]{1,2})/);
if (parts) {
  var dob = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (dob[0] > 1700) dob = julianDayToHijri(toJulianDay(dob[0], dob[1], dob[2]));
  var age = today[0] - dob[0];
  if (today[1] < dob[1] || (today[1] === dob[1] && today[2] < dob[2])) age = age - 1;
  output.applicantAgeHijri = age;
}
