export type ProfileLinkOptions = {
  isBot?: boolean | null;
  placeholder?: boolean | null;
};

export function canLinkToProfile(username: string | null | undefined, options: ProfileLinkOptions = {}) {
  return Boolean(username?.trim()) && !options.isBot && !options.placeholder;
}

export function getProfilePath(username: string) {
  return `/profile/${encodeURIComponent(username)}`;
}
