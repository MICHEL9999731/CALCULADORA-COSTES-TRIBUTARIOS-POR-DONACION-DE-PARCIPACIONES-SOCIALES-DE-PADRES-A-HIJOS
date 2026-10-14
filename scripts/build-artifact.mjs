// Genera artifact/direccion-financiera.html: la aplicación completa en un único
// archivo HTML (JS y CSS incrustados, sin dependencias externas), lista para
// publicarse en claude.ai como Artifact o abrirse directamente en el navegador.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const run = cmd => execSync(cmd, { cwd: root, stdio: 'inherit' });

run('npx vite build');
run('npx tailwindcss -c tailwind.config.cjs -i scripts/tailwind.css -o dist/tailwind.css --minify');

const assets = join(root, 'dist/assets');
const jsFile = readdirSync(assets).find(f => f.endsWith('.js'));
const js = readFileSync(join(assets, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const tailwind = readFileSync(join(root, 'dist/tailwind.css'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const ownStyles = [...indexHtml.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

const html = `<title>Dirección Financiera</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${tailwind}
${ownStyles}
:root { color-scheme: dark; }
body { background: #0f172a; color: #e2e8f0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
#root > .min-h-screen {
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

mkdirSync(join(root, 'artifact'), { recursive: true });
const out = join(root, 'artifact/direccion-financiera.html');
writeFileSync(out, html);
console.log(`\n✓ ${out} (${(html.length / 1024).toFixed(0)} KB)`);
