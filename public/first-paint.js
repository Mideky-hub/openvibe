// Runs before the first paint (index.html, same origin: the CSP allows it): the saved theme,
// mirrored in localStorage by src/app/theme.ts, so the first image is not in Windows' theme
// when the choice is another one, and has tokens before the app's JavaScript loads.
(function () {
  var root = document.documentElement;
  var choice = null;
  var transparency = null;
  try {
    choice = localStorage.getItem("ov.theme");
    transparency = localStorage.getItem("ov.transparency");
  } catch (e) {
    // No storage: Windows' theme, transparency on.
  }
  var dark = choice === "dark" || (choice !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  if (transparency === "off") root.dataset.transparency = "off";
})();
