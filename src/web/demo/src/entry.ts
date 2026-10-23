// The site's entry: register the extension, then start the real app. An ES module graph evaluates these two imports in order, so the app finds the
// extension when its own modules load (apps/ui/src/appExtension.tsx).
import './register';
import '@ui/main';
