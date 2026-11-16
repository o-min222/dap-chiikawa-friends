export async function activate(ctx) {
  const api = ctx.host.petSkins;
  if (!api?.supportedSkinVersions?.includes(2)) {
    throw new Error('DAP Assistant 고프레임 스킨을 지원하는 본체가 필요해요.');
  }
  const registration = await api.registerSkin({
    id: 'assistant',
    displayName: 'DAP Assistant',
    schemaVersion: 2,
    manifestPath: 'assets/asset-pack.json',
    posterPath: 'assets/poster.png',
    cell: { width: 256, height: 256 },
  });
  const section = `${ctx.pluginId}.character`;
  let stopped = false;
  let saving = Promise.resolve();
  const unsubscribe = api.onDidChange(() => {
    const selected = api.getActiveSkin() === registration.id;
    saving = saving.then(() => ctx.host.settings.set(section, 'selected', selected))
      .catch(error => console.error('[DAP Assistant] selection save failed', error));
  });
  try {
    if (ctx.host.settings.values(section).selected !== false) {
      await registration.apply({ usePersona: false });
    }
  } catch (error) {
    unsubscribe();
    await registration.dispose();
    throw error;
  }
  return async () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    await saving;
    await registration.dispose();
  };
}
