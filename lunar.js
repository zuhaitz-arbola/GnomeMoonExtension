/**
 * lunar.js — Local astronomical lunar calculations.
 *
 * Provides lunar phase, illumination fraction, synodic age, and
 * topocentric position (azimuth / elevation) using algorithms from
 * Jean Meeus's "Astronomical Algorithms" (2nd ed.).
 *
 * All calculations run entirely offline — no network requests.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const DEG = Math.PI / 180;   // degrees → radians
const RAD = 180 / Math.PI;   // radians → degrees
const TWO_PI = 2 * Math.PI;

/* Synodic month average (days). */
const SYNODIC_MONTH = 29.530588861;

/* ------------------------------------------------------------------ */
/*  Julian Day helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Convert a Gregorian calendar date to Julian Day Number.
 * Valid for dates after 15 October 1582 (Gregorian reform).
 */
export function julianDay(year, month, day) {
    if (month <= 2) {
        year  -= 1;
        month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716))
         + Math.floor(30.6001 * (month + 1))
         + day + B - 1524.5;
}

/** Julian Century (36 525 days) from J2000.0 epoch. */
export function julianCentury(jd) {
    return (jd - 2451545.0) / 36525.0;
}

/* ------------------------------------------------------------------ */
/*  Lunar orbital elements (Meeus, Ch. 47)                             */
/* ------------------------------------------------------------------ */

/**
 * Compute the Moon's ecliptic longitude, latitude, and distance.
 *
 * Uses the principal periodic terms from Meeus Ch. 47.
 * Returns { lambda (°), beta (°), distance (km) }.
 */
export function lunarPosition(T) {
    /* Fundamental arguments (degrees). */

    /* Moon's mean longitude, referred to the mean equinox of the date. */
    let Lp = 218.3164477 + 481267.88123421 * T
           - 0.0015786 * T * T
           + T * T * T / 538841.0
           - T * T * T * T / 65194000.0;
    Lp = normDeg(Lp);

    /* Moon's mean anomaly. */
    let M = 134.9633964 + 477198.8675055 * T
          + 0.0087414 * T * T
          + T * T * T / 69699.0
          - T * T * T * T / 14712000.0;
    M = normDeg(M);

    /* Sun's mean anomaly. */
    let Ms = 357.5291092 + 35999.0502909 * T
           - 0.0001536 * T * T
           + T * T * T / 24490000.0;
    Ms = normDeg(Ms);

    /* Moon's mean elongation. */
    let D = 297.8501921 + 445267.1114034 * T
          - 0.0018819 * T * T
          + T * T * T / 545868.0
          - T * T * T * T / 113065000.0;
    D = normDeg(D);

    /* Moon's argument of latitude (mean distance from ascending node). */
    let F = 93.2720950 + 483202.0175233 * T
          - 0.0036539 * T * T
          - T * T * T / 3526000.0
          + T * T * T * T / 863310000.0;
    F = normDeg(F);

    /* Eccentricity correction. */
    const E  = 1.0 - 0.002516 * T - 0.0000074 * T * T;
    const E2 = E * E;

    /* Convert to radians for trig. */
    const Dr = D * DEG;
    const Mr = M * DEG;
    const Msr = Ms * DEG;
    const Fr = F * DEG;

    /* ------ Longitude terms (principal 60 terms from Meeus Table 47.A) ------ */
    let sumL = 0;
    sumL += 6288774  * Math.sin(Mr);
    sumL += 1274027  * Math.sin(2 * Dr - Mr);
    sumL += 658314   * Math.sin(2 * Dr);
    sumL += 213618   * Math.sin(2 * Mr);
    sumL += -185116  * Math.sin(Msr) * E;
    sumL += -114332  * Math.sin(2 * Fr);
    sumL += 58793    * Math.sin(2 * Dr - 2 * Mr);
    sumL += 57066    * Math.sin(2 * Dr - Mr - Msr) * E;
    sumL += 53322    * Math.sin(2 * Dr + Mr);
    sumL += 45758    * Math.sin(2 * Dr - Msr) * E;
    sumL += -40923   * Math.sin(Mr - Msr) * E;
    sumL += -34720   * Math.sin(Dr);
    sumL += -30383   * Math.sin(Mr + Msr) * E;
    sumL += 15327    * Math.sin(2 * Dr - 2 * Fr);
    sumL += -12528   * Math.sin(Mr + 2 * Fr);
    sumL += 10980    * Math.sin(Mr - 2 * Fr);
    sumL += 10675    * Math.sin(4 * Dr - Mr);
    sumL += 10034    * Math.sin(3 * Mr);
    sumL += 8548     * Math.sin(4 * Dr - 2 * Mr);
    sumL += -7888    * Math.sin(2 * Dr + Msr - Mr) * E;
    sumL += -6766    * Math.sin(2 * Dr + Msr) * E;
    sumL += -5163    * Math.sin(Dr - Mr);
    sumL += 4987     * Math.sin(Dr + Msr) * E;
    sumL += 4036     * Math.sin(2 * Dr - Msr + Mr) * E;
    sumL += 3994     * Math.sin(2 * Dr + 2 * Mr);
    sumL += 3861     * Math.sin(4 * Dr);
    sumL += 3665     * Math.sin(2 * Dr - 3 * Mr);
    sumL += -2689    * Math.sin(Msr - 2 * Mr) * E;
    sumL += -2602    * Math.sin(2 * Dr - Mr + 2 * Fr);
    sumL += 2390     * Math.sin(2 * Dr - Mr - 2 * Msr) * E2;
    sumL += -2348    * Math.sin(Dr + Mr);
    sumL += 2236     * Math.sin(2 * Dr - 2 * Msr) * E2;
    sumL += -2120    * Math.sin(Mr + 2 * Msr) * E2;
    sumL += -2069    * Math.sin(2 * Msr) * E2;
    sumL += 2048     * Math.sin(2 * Dr - 2 * Mr - Msr) * E;
    sumL += -1773    * Math.sin(2 * Dr + Mr - 2 * Fr);
    sumL += -1595    * Math.sin(2 * Dr + 2 * Fr);
    sumL += 1215     * Math.sin(4 * Dr - Msr - Mr) * E;
    sumL += -1110    * Math.sin(2 * Mr + 2 * Fr);
    sumL += -892     * Math.sin(3 * Dr - Mr);
    sumL += -810     * Math.sin(2 * Dr + Msr + Mr) * E;
    sumL += 759      * Math.sin(4 * Dr - Msr - 2 * Mr) * E;
    sumL += -713     * Math.sin(2 * Msr - Mr) * E2;
    sumL += -700     * Math.sin(2 * Dr + 2 * Msr - Mr) * E2;
    sumL += 691      * Math.sin(2 * Dr + Mr - 2 * Fr);
    sumL += 596      * Math.sin(2 * Dr - Mr - 2 * Fr);
    sumL += 549      * Math.sin(4 * Dr + Mr);
    sumL += 537      * Math.sin(4 * Mr);
    sumL += 520      * Math.sin(4 * Dr - Msr) * E;
    sumL += -487     * Math.sin(Dr - 2 * Mr);
    sumL += -399     * Math.sin(2 * Dr + Msr - 2 * Fr) * E;
    sumL += -381     * Math.sin(2 * Mr - 2 * Fr);
    sumL += 351      * Math.sin(Dr + Msr + Mr) * E;
    sumL += -340     * Math.sin(3 * Dr - 2 * Mr);
    sumL += 330      * Math.sin(4 * Dr - 3 * Mr);
    sumL += 327      * Math.sin(2 * Dr - Msr + 2 * Mr) * E;
    sumL += -323     * Math.sin(2 * Msr + Mr) * E2;
    sumL += 299      * Math.sin(Dr + Msr - Mr) * E;
    sumL += 294      * Math.sin(2 * Dr + 3 * Mr);

    /* ------ Latitude terms (Meeus Table 47.B) ------ */
    let sumB = 0;
    sumB += 5128122  * Math.sin(Fr);
    sumB += 280602   * Math.sin(Mr + Fr);
    sumB += 277693   * Math.sin(Mr - Fr);
    sumB += 173237   * Math.sin(2 * Dr - Fr);
    sumB += 55413    * Math.sin(2 * Dr - Mr + Fr);
    sumB += 46271    * Math.sin(2 * Dr - Mr - Fr);
    sumB += 32573    * Math.sin(2 * Dr + Fr);
    sumB += 17198    * Math.sin(2 * Mr + Fr);
    sumB += 9266     * Math.sin(2 * Dr + Mr - Fr);
    sumB += 8822     * Math.sin(2 * Mr - Fr);
    sumB += -8143    * Math.sin(Msr - Fr) * E;
    sumB += 4120     * Math.sin(2 * Dr - 2 * Mr + Fr);   /* Not E-weighted */
    sumB += -3999    * Math.sin(2 * Dr + Msr + Fr) * E;   /* Fixed: Was +Fr */
    sumB += 3620     * Math.sin(Msr + Fr) * E;            /* Fixed: sign */
    sumB += -3333    * Math.sin(2 * Dr - Msr - Fr) * E;   /* Fixed: sign */
    sumB += 2776     * Math.sin(2 * Dr + Mr + Fr);
    sumB += 2222     * Math.sin(2 * Dr + Mr - Fr);
    /* (remaining smaller terms omitted for brevity — error < 2') */

    /* ------ Distance terms (Meeus Table 47.A, cos column) ------ */
    let sumR = 0;
    sumR += -20905355 * Math.cos(Mr);
    sumR += -3699111  * Math.cos(2 * Dr - Mr);
    sumR += -2955968  * Math.cos(2 * Dr);
    sumR += -569925   * Math.cos(2 * Mr);
    sumR += 48888     * Math.cos(Msr) * E;
    sumR += -3149     * Math.cos(2 * Fr);
    sumR += 246158    * Math.cos(2 * Dr - 2 * Mr);
    sumR += -152138   * Math.cos(2 * Dr - Mr - Msr) * E;
    sumR += -170733   * Math.cos(2 * Dr + Mr);
    sumR += -204586   * Math.cos(2 * Dr - Msr) * E;
    sumR += -129620   * Math.cos(Mr - Msr) * E;
    sumR += 108743    * Math.cos(Dr);
    sumR += 104755    * Math.cos(Mr + Msr) * E;
    sumR += 10321     * Math.cos(2 * Dr - 2 * Fr);
    sumR += 79661     * Math.cos(Mr - 2 * Fr);
    sumR += -34782    * Math.cos(4 * Dr - Mr);
    sumR += -23210    * Math.cos(3 * Mr);
    sumR += -21636    * Math.cos(4 * Dr - 2 * Mr);
    sumR += 24208     * Math.cos(2 * Dr + Msr - Mr) * E;
    sumR += 30824     * Math.cos(2 * Dr + Msr) * E;
    sumR += -8379     * Math.cos(Dr - Mr);
    sumR += -16675    * Math.cos(Dr + Msr) * E;
    sumR += -12831    * Math.cos(2 * Dr - Msr + Mr) * E;
    sumR += -10445    * Math.cos(2 * Dr + 2 * Mr);
    sumR += -11650    * Math.cos(4 * Dr);
    sumR += 14403     * Math.cos(2 * Dr - 3 * Mr);
    sumR += -7003     * Math.cos(Msr - 2 * Mr) * E;
    sumR += 10056     * Math.cos(2 * Dr - Mr - 2 * Msr) * E2;
    sumR += 6322      * Math.cos(Dr + Mr);
    sumR += -9884     * Math.cos(2 * Dr - 2 * Msr) * E2;

    /* Additional nutation correction for longitude. */
    const A1 = normDeg(119.75 + 131.849 * T) * DEG;
    const A2 = normDeg(53.09 + 479264.290 * T) * DEG;
    const A3 = normDeg(313.45 + 481266.484 * T) * DEG;

    sumL += 3958 * Math.sin(A1)
          + 1962 * Math.sin(Lp * DEG - Fr)
          + 318  * Math.sin(A2);

    sumB += -2235 * Math.sin(Lp * DEG)
          + 382   * Math.sin(A3)
          + 175   * Math.sin(A1 - Fr)
          + 175   * Math.sin(A1 + Fr)
          + 127   * Math.sin(Lp * DEG - Mr)
          - 115   * Math.sin(Lp * DEG + Mr);

    /* Ecliptic longitude and latitude (degrees). */
    const lambda = Lp + sumL / 1000000.0;
    const beta   = sumB / 1000000.0;

    /* Distance in km. */
    const distance = 385000.56 + sumR / 1000.0;

    return { lambda: normDeg(lambda), beta, distance };
}

/* ------------------------------------------------------------------ */
/*  Obliquity of the ecliptic                                          */
/* ------------------------------------------------------------------ */

/** Mean obliquity of the ecliptic (degrees). */
export function meanObliquity(T) {
    const seconds = 21.448 - T * (46.8150 + T * (0.00059 - T * 0.001813));
    return 23.0 + (26.0 + seconds / 60.0) / 60.0;
}

/* ------------------------------------------------------------------ */
/*  Ecliptic → Equatorial coordinate conversion                        */
/* ------------------------------------------------------------------ */

/**
 * Convert ecliptic (lambda, beta) to equatorial (RA, Dec) in degrees.
 */
export function eclipticToEquatorial(lambda, beta, T) {
    const eps = meanObliquity(T) * DEG;
    const lam = lambda * DEG;
    const bet = beta * DEG;

    const sinRA = Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps);
    const cosRA = Math.cos(lam);
    let RA = Math.atan2(sinRA, cosRA) * RAD;
    RA = normDeg(RA);

    const sinDec = Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam);
    const dec = Math.asin(sinDec) * RAD;

    return { ra: RA, dec };
}

/* ------------------------------------------------------------------ */
/*  Topocentric position (azimuth & elevation)                         */
/* ------------------------------------------------------------------ */

/**
 * Convert equatorial (RA, Dec) to horizontal (azimuth, elevation)
 * for a given observer latitude/longitude and sidereal time.
 */
export function equatorialToHorizontal(ra, dec, lat, lon, jd) {
    /* Greenwich Mean Sidereal Time (degrees). */
    const T0 = (jd - 2451545.0) / 36525.0;
    let gmst = 280.46061837
             + 360.98564736629 * (jd - 2451545.0)
             + 0.000387933 * T0 * T0
             - T0 * T0 * T0 / 38710000.0;
    gmst = normDeg(gmst);

    /* Local sidereal time. */
    const lst = normDeg(gmst + lon);

    /* Hour angle. */
    const ha = normDeg(lst - ra) * DEG;
    const latR = lat * DEG;
    const decR = dec * DEG;

    /* Elevation (altitude). */
    const sinAlt = Math.sin(latR) * Math.sin(decR)
                 + Math.cos(latR) * Math.cos(decR) * Math.cos(ha);
    const elevation = Math.asin(Math.min(1, Math.max(-1, sinAlt))) * RAD;

    /* Azimuth (from North, clockwise). */
    const cosAz = (Math.sin(decR) - Math.sin(latR) * sinAlt)
                / (Math.cos(latR) * Math.cos(elevation * DEG));
    let azimuth = Math.acos(Math.min(1, Math.max(-1, cosAz))) * RAD;
    if (Math.sin(ha) > 0) {
        azimuth = 360 - azimuth;
    }

    return { azimuth, elevation };
}

/* ------------------------------------------------------------------ */
/*  Phase calculations                                                 */
/* ------------------------------------------------------------------ */

/**
 * Compute sun's ecliptic longitude (simplified, for phase angle).
 */
function sunEclipticLongitude(T) {
    const M = (357.5291092 + 35999.0502909 * T) * DEG;
    const C = (1.9146 - 0.004817 * T) * Math.sin(M)
            + 0.019993 * Math.sin(2 * M)
            + 0.00029 * Math.sin(3 * M);
    const L0 = 280.46646 + 36000.76983 * T;
    return normDeg(L0 + C);
}

/**
 * Compute the phase angle (elongation) of the Moon.
 *
 * Returns the angle in degrees (0° = new moon, 180° = full moon).
 */
export function phaseAngle(T) {
    const moon = lunarPosition(T);
    const sunLon = sunEclipticLongitude(T);

    /* Phase angle = elongation between moon and sun (ecliptic). */
    let i = moon.lambda - sunLon;
    i = normDeg(i);

    return i;
}

/**
 * Illuminated fraction (0.0 = new moon, 1.0 = full moon).
 */
export function illuminatedFraction(phaseAngleDeg) {
    return (1 - Math.cos(phaseAngleDeg * DEG)) / 2;
}

/**
 * Determine the named phase of the Moon.
 *
 * Returns { name, index } where index is 0-7:
 *   0 = New Moon, 1 = Waxing Crescent, 2 = First Quarter,
 *   3 = Waxing Gibbous, 4 = Full Moon, 5 = Waning Gibbous,
 *   6 = Last Quarter, 7 = Waning Crescent
 */
export function phaseName(phaseAngleDeg) {
    const a = normDeg(phaseAngleDeg);

    if (a <  11.25) return { name: 'New Moon',         index: 0 };
    if (a <  78.75) return { name: 'Waxing Crescent',  index: 1 };
    if (a < 101.25) return { name: 'First Quarter',    index: 2 };
    if (a < 168.75) return { name: 'Waxing Gibbous',   index: 3 };
    if (a < 191.25) return { name: 'Full Moon',        index: 4 };
    if (a < 258.75) return { name: 'Waning Gibbous',   index: 5 };
    if (a < 281.25) return { name: 'Last Quarter',     index: 6 };
    if (a < 348.75) return { name: 'Waning Crescent',  index: 7 };
    return { name: 'New Moon', index: 0 };
}

/**
 * Calculate the synodic age of the Moon (days since last new moon).
 *
 * Uses the phase angle to derive age within the current synodic month.
 */
export function synodicAge(phaseAngleDeg) {
    const a = normDeg(phaseAngleDeg);
    return (a / 360) * SYNODIC_MONTH;
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

/** Normalise angle to 0-360 range. */
function normDeg(deg) {
    return ((deg % 360) + 360) % 360;
}

/* ------------------------------------------------------------------ */
/*  Public API — single-call entry point                               */
/* ------------------------------------------------------------------ */

/**
 * Compute every lunar datum for a given geographic position and instant.
 *
 * @param {number} lat   Latitude  (decimal degrees, north positive)
 * @param {number} lon   Longitude (decimal degrees, east positive)
 * @param {Date}   date  JavaScript Date object (local time)
 * @returns {object}     Lunar data bundle
 */
export function getLunarData(lat, lon, date) {
    const year    = date.getFullYear();
    const month   = date.getMonth() + 1;
    const day     = date.getDate();
    const hours   = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    /* Timezone offset in hours, east-positive. */
    const tz = -date.getTimezoneOffset() / 60;

    /* Julian Day at calendar midnight (local). */
    const jd0 = julianDay(year, month, day);

    /* Fractional day. */
    const dayFrac = (hours + minutes / 60 + seconds / 3600) / 24;

    /* Julian Day for the current instant (UT). */
    const jd = jd0 + dayFrac - tz / 24;

    /* Julian Century. */
    const T = julianCentury(jd);

    /* Lunar ecliptic coordinates. */
    const moonPos = lunarPosition(T);

    /* Equatorial coordinates. */
    const eq = eclipticToEquatorial(moonPos.lambda, moonPos.beta, T);

    /* Horizontal coordinates (topocentric). */
    const horiz = equatorialToHorizontal(eq.ra, eq.dec, lat, lon, jd);

    /* Phase data. */
    const angle = phaseAngle(T);
    const illum = illuminatedFraction(angle);
    const phase = phaseName(angle);
    const age   = synodicAge(angle);

    return {
        /* Phase */
        phaseAngle:    angle,
        illumination:  illum,
        phaseName:     phase.name,
        phaseIndex:    phase.index,
        age:           age,

        /* Position */
        elevation:  horiz.elevation,
        azimuth:    horiz.azimuth,
        distance:   moonPos.distance,

        /* Equatorial */
        ra:  eq.ra,
        dec: eq.dec,

        /* Raw ecliptic */
        eclLon: moonPos.lambda,
        eclLat: moonPos.beta,
    };
}
