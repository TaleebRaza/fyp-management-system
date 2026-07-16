export type ProjectDomainOption = {
  id: string;
  label: string;
  aliases?: readonly string[];
};

export type ProjectDomainGroup = {
  category: string;
  options: readonly ProjectDomainOption[];
};

export const PROJECT_DOMAIN_GROUPS: readonly ProjectDomainGroup[] = [
  {
    category: 'Artificial Intelligence and Data',
    options: [
      { id: 'artificial-intelligence', label: 'Artificial Intelligence', aliases: ['AI'] },
      { id: 'machine-learning', label: 'Machine Learning', aliases: ['ML'] },
      { id: 'deep-learning', label: 'Deep Learning', aliases: ['DL'] },
      { id: 'natural-language-processing', label: 'Natural Language Processing', aliases: ['NLP'] },
      { id: 'computer-vision', label: 'Computer Vision', aliases: ['CV'] },
      { id: 'data-science-analytics', label: 'Data Science and Analytics', aliases: ['Data Science', 'Data Analytics'] },
      { id: 'big-data', label: 'Big Data' },
    ],
  },
  {
    category: 'Applications and Interactive Systems',
    options: [
      { id: 'web-applications', label: 'Web Applications', aliases: ['Web Development', 'Web App'] },
      { id: 'mobile-applications', label: 'Mobile Applications', aliases: ['Mobile Development', 'Mobile App'] },
      { id: 'game-development', label: 'Game Development' },
      { id: 'augmented-reality', label: 'Augmented Reality', aliases: ['AR'] },
      { id: 'virtual-reality', label: 'Virtual Reality', aliases: ['VR'] },
      { id: 'human-computer-interaction', label: 'Human-Computer Interaction', aliases: ['HCI'] },
    ],
  },
  {
    category: 'Systems and Infrastructure',
    options: [
      { id: 'cloud-computing', label: 'Cloud Computing' },
      { id: 'distributed-systems', label: 'Distributed Systems' },
      { id: 'database-systems', label: 'Database Systems', aliases: ['Databases'] },
      { id: 'internet-of-things', label: 'Internet of Things', aliases: ['IoT'] },
      { id: 'embedded-systems', label: 'Embedded Systems' },
      { id: 'robotics', label: 'Robotics' },
      {
        id: 'networks-telecommunications',
        label: 'Networks and Telecommunications',
        aliases: ['Computer Networks', 'Networking', 'Telecommunications'],
      },
    ],
  },
  {
    category: 'Security and Emerging Technologies',
    options: [
      { id: 'cybersecurity', label: 'Cybersecurity', aliases: ['Cyber Security', 'Information Security'] },
      { id: 'blockchain', label: 'Blockchain' },
      { id: 'geographic-information-systems', label: 'Geographic Information Systems', aliases: ['GIS'] },
      { id: 'health-informatics', label: 'Health Informatics', aliases: ['Digital Health'] },
      { id: 'education-technology', label: 'Education Technology', aliases: ['EdTech'] },
      { id: 'financial-technology', label: 'Financial Technology', aliases: ['FinTech'] },
      { id: 'e-commerce', label: 'E-Commerce', aliases: ['Ecommerce'] },
      { id: 'other-interdisciplinary', label: 'Other / Interdisciplinary', aliases: ['Other', 'Interdisciplinary'] },
    ],
  },
] as const;

export const PROJECT_DOMAINS: readonly ProjectDomainOption[] =
  PROJECT_DOMAIN_GROUPS.flatMap((group) => group.options);

const DOMAIN_BY_ID = new Map(PROJECT_DOMAINS.map((domain) => [domain.id, domain]));

const normalizeLookupKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DOMAIN_ID_BY_ALIAS = new Map<string, string>();

PROJECT_DOMAINS.forEach((domain) => {
  const aliases = [domain.id, domain.label, ...(domain.aliases || [])];

  aliases.forEach((alias) => {
    DOMAIN_ID_BY_ALIAS.set(normalizeLookupKey(alias), domain.id);
  });
});

const splitLegacyDomainText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const exactMatch = DOMAIN_ID_BY_ALIAS.get(normalizeLookupKey(trimmed));
  if (exactMatch) return [exactMatch];

  return trimmed
    .split(/\s*(?:\+|,|;|\||\/|&)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

export function isProjectDomainId(value: unknown): value is string {
  return typeof value === 'string' && DOMAIN_BY_ID.has(value);
}

export function validateProjectDomainIds(value: unknown) {
  if (!Array.isArray(value)) {
    return {
      isArray: false,
      ids: [] as string[],
      invalid: [] as string[],
    };
  }

  const ids: string[] = [];
  const invalid: string[] = [];

  value.forEach((candidate) => {
    const normalizedCandidate = String(candidate || '').trim();

    if (!isProjectDomainId(normalizedCandidate)) {
      if (normalizedCandidate) invalid.push(normalizedCandidate);
      return;
    }

    if (!ids.includes(normalizedCandidate)) {
      ids.push(normalizedCandidate);
    }
  });

  return {
    isArray: true,
    ids,
    invalid,
  };
}

export function normalizeProjectDomainIds(values: unknown, legacyValue?: unknown) {
  const normalizedIds: string[] = [];
  const candidates = Array.isArray(values) ? values : [];

  candidates.forEach((candidate) => {
    const rawValue = String(candidate || '').trim();
    if (!rawValue) return;

    const domainId = DOMAIN_BY_ID.has(rawValue)
      ? rawValue
      : DOMAIN_ID_BY_ALIAS.get(normalizeLookupKey(rawValue));

    if (domainId && !normalizedIds.includes(domainId)) {
      normalizedIds.push(domainId);
    }
  });

  if (normalizedIds.length > 0) {
    return normalizedIds;
  }

  splitLegacyDomainText(String(legacyValue || '')).forEach((candidate) => {
    const domainId = DOMAIN_BY_ID.has(candidate)
      ? candidate
      : DOMAIN_ID_BY_ALIAS.get(normalizeLookupKey(candidate));

    if (domainId && !normalizedIds.includes(domainId)) {
      normalizedIds.push(domainId);
    }
  });

  return normalizedIds;
}

export function getProjectDomainLabel(domainId: string) {
  return DOMAIN_BY_ID.get(domainId)?.label || domainId;
}

export function getProjectDomainLabels(domainIds: unknown) {
  if (!Array.isArray(domainIds)) return [];

  return domainIds
    .filter(isProjectDomainId)
    .map((domainId) => getProjectDomainLabel(domainId));
}

export function formatProjectDomainLabels(domainIds: unknown, legacyValue?: unknown) {
  const labels = getProjectDomainLabels(domainIds);

  if (labels.length > 0) {
    return labels.join(', ');
  }

  return String(legacyValue || '').trim();
}