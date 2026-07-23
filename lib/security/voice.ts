export function isOwnedVoiceKey(key: unknown, userId: string, projectId: string) {
  return typeof key === 'string' && key.startsWith(`voicenotes/${userId}/${projectId}/`);
}
