/* Example Creator Studio mod. Loaded only when this PC has a valid license. */
const studio = window.CreatorStudio;
if (studio) {
  studio.log("Example Theme loaded", studio.version);

  studio.ui.addHeaderButton({
    id: "example-theme-button",
    label: "Example Mod",
    icon: "sparkle",
    onClick() {
      studio.toast("Example Theme is running. Edit mods/example-theme/main.js to customise it.", "success");
    },
  });

  // Example tool override. Return true to take over the click, false/undefined
  // to let the normal Rectangle tool run.
  // studio.tools.override("rect", ({ engine }) => {
  //   studio.toast("Rectangle click intercepted by the example mod");
  //   return false;
  // });

  studio.ui.addStyle(":root { --mod-accent: #ff5cc8; }");
}
