/**
 * Shared list of country dial codes used by the profile phone/WhatsApp UI
 * and the login form's phone sign-in flow.
 *
 * Keep this list conservative and ordered so the most common markets appear
 * first in the picker.
 */
export type CountryCode = {
  dial: string;
  name: string;
  flag: string;
};

export const COUNTRY_CODES: readonly CountryCode[] = [
  { dial: "+91", name: "India", flag: "🇮🇳" },
  { dial: "+1", name: "US / Canada", flag: "🇺🇸" },
  { dial: "+44", name: "UK", flag: "🇬🇧" },
  { dial: "+61", name: "Australia", flag: "🇦🇺" },
  { dial: "+27", name: "South Africa", flag: "🇿🇦" },
  { dial: "+234", name: "Nigeria", flag: "🇳🇬" },
  { dial: "+92", name: "Pakistan", flag: "🇵🇰" },
  { dial: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { dial: "+94", name: "Sri Lanka", flag: "🇱🇰" },
  { dial: "+60", name: "Malaysia", flag: "🇲🇾" },
  { dial: "+65", name: "Singapore", flag: "🇸🇬" },
  { dial: "+971", name: "UAE", flag: "🇦🇪" },
  { dial: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { dial: "+20", name: "Egypt", flag: "🇪🇬" },
  { dial: "+254", name: "Kenya", flag: "🇰🇪" },
  { dial: "+233", name: "Ghana", flag: "🇬🇭" },
  { dial: "+49", name: "Germany", flag: "🇩🇪" },
  { dial: "+33", name: "France", flag: "🇫🇷" },
  { dial: "+55", name: "Brazil", flag: "🇧🇷" },
  { dial: "+52", name: "Mexico", flag: "🇲🇽" },
  { dial: "+81", name: "Japan", flag: "🇯🇵" },
  { dial: "+82", name: "South Korea", flag: "🇰🇷" },
  { dial: "+86", name: "China", flag: "🇨🇳" },
  { dial: "+62", name: "Indonesia", flag: "🇮🇩" },
  { dial: "+63", name: "Philippines", flag: "🇵🇭" },
  { dial: "+64", name: "New Zealand", flag: "🇳🇿" },
  { dial: "+7", name: "Russia", flag: "🇷🇺" },
  { dial: "+34", name: "Spain", flag: "🇪🇸" },
  { dial: "+39", name: "Italy", flag: "🇮🇹" },
  { dial: "+31", name: "Netherlands", flag: "🇳🇱" },
  { dial: "+46", name: "Sweden", flag: "🇸🇪" },
  { dial: "+47", name: "Norway", flag: "🇳🇴" },
  { dial: "+45", name: "Denmark", flag: "🇩🇰" },
  { dial: "+41", name: "Switzerland", flag: "🇨🇭" },
  { dial: "+48", name: "Poland", flag: "🇵🇱" },
  { dial: "+90", name: "Turkey", flag: "🇹🇷" },
  { dial: "+98", name: "Iran", flag: "🇮🇷" },
  { dial: "+212", name: "Morocco", flag: "🇲🇦" },
  { dial: "+213", name: "Algeria", flag: "🇩🇿" },
  { dial: "+256", name: "Uganda", flag: "🇺🇬" },
  { dial: "+255", name: "Tanzania", flag: "🇹🇿" },
  { dial: "+251", name: "Ethiopia", flag: "🇪🇹" },
] as const;

/** Returns the country entry matching an exact dial code, or undefined. */
export function findCountryByDial(dial: string): CountryCode | undefined {
  return COUNTRY_CODES.find((c) => c.dial === dial);
}
