import { defineMock, defineOverride } from 'vite-plugin-apitemkin';

interface Profile {
  id: number;
  name: string;
  verified: boolean;
  address: { city: string; country: string };
  preferences: { theme: 'light' | 'dark'; locale: string };
}

const baseProfile: Profile = {
  id: 1,
  name: 'Ada Lovelace',
  verified: true,
  address: { city: 'London', country: 'UK' },
  preferences: { theme: 'light', locale: 'en-GB' },
};

export default defineMock<Profile>({
  default:    baseProfile,
  unverified: defineOverride(baseProfile, { verified: false }),
  inParis:    defineOverride(baseProfile, { address: { city: 'Paris', country: 'FR' } }),
  darkMode:   defineOverride(baseProfile, { preferences: { theme: 'dark' } }),
});
