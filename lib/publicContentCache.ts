import { revalidateTag, unstable_cache } from 'next/cache';

import connectToDatabase from './mongodb';
import { readRegistrationPolicy, serializeRegistrationPolicy } from './registrationPolicy';
import { getBranding } from './branding';
import { getSupervisorExtraSlots, getSupervisorMaxSlots } from './supervisorSlots';
import Headline from '../models/Headline';
import User from '../models/User';

const CACHE_REVALIDATE_SECONDS = 60;

export const PUBLIC_HEADLINE_TAG = 'public-headline';
export const PUBLIC_REGISTRATION_POLICY_TAG = 'public-registration-policy';
export const PUBLIC_SUPERVISORS_TAG = 'public-supervisors';
export const PUBLIC_BRANDING_TAG = 'public-branding';

const getCachedHeadline = unstable_cache(
  async () => {
    await connectToDatabase();
    const headline = await Headline.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .select('_id text createdAt')
      .lean();

    return headline && {
      _id: headline._id.toString(),
      text: headline.text,
      createdAt: headline.createdAt,
    };
  },
  ['public-headline'],
  { tags: [PUBLIC_HEADLINE_TAG], revalidate: CACHE_REVALIDATE_SECONDS }
);

const getCachedRegistrationPolicy = unstable_cache(
  async () => {
    await connectToDatabase();
    return serializeRegistrationPolicy(await readRegistrationPolicy().lean());
  },
  ['public-registration-policy'],
  { tags: [PUBLIC_REGISTRATION_POLICY_TAG], revalidate: CACHE_REVALIDATE_SECONDS }
);

const getCachedSupervisors = unstable_cache(
  async () => {
    await connectToDatabase();
    const supervisors = await User.find({ role: 'supervisor' })
      .select('_id name extraSlots occupiedSlots')
      .lean();

    return supervisors.map((supervisor) => {
      const capacityReady = Number.isInteger(supervisor.occupiedSlots) && supervisor.occupiedSlots >= 0;
      const filledSlots = capacityReady ? supervisor.occupiedSlots : 0;
      const extraSlots = getSupervisorExtraSlots(supervisor);
      const maxSlots = getSupervisorMaxSlots(supervisor);

      return {
        _id: supervisor._id.toString(),
        name: supervisor.name,
        extraSlots,
        filledSlots,
        capacityReady,
        isFull: !capacityReady || filledSlots >= maxSlots,
        maxSlots,
      };
    });
  },
  ['public-supervisors'],
  { tags: [PUBLIC_SUPERVISORS_TAG], revalidate: CACHE_REVALIDATE_SECONDS }
);

const getCachedBranding = unstable_cache(
  async () => await getBranding(),
  ['public-branding'],
  { tags: [PUBLIC_BRANDING_TAG], revalidate: CACHE_REVALIDATE_SECONDS }
);

export const getPublicHeadline = getCachedHeadline;
export const getPublicRegistrationPolicy = getCachedRegistrationPolicy;
export const getPublicSupervisors = getCachedSupervisors;
export const getPublicBranding = getCachedBranding;

export function invalidatePublicContent(tag: string) {
  revalidateTag(tag, 'max');
}
