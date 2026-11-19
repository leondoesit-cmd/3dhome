// Geometry fixtures use canonical centimetres; select that input/display unit
// explicitly instead of depending on locale and evolving project defaults.
export async function useCentimetres(page) {
  await page.eval(async () => {
    const {saveUnitSettings} = await import('/js/unit_settings.js');
    saveUnitSettings({preset:'metric_cm',overrides:{rooms:{unit:'cm',digits:6},plan:{unit:'cm',digits:6}}});
  });
}
