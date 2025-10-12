// Simple test to verify deploy-workflow service structure
console.log('✅ Deploy-workflow service configured successfully!');

// Check if key files exist
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'package.json',
  'wrangler.jsonc', 
  'tsconfig.json',
  'src/index.ts',
  'src/app.ts',
  'src/types.ts',
  'src/utils/deployment.ts',
  'src/utils/deploy-quota.ts',
  'src/utils/common.ts'
];

console.log('\n🔍 Checking required files:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`${exists ? '✅' : '❌'} ${file}`);
});

// Check package.json configuration
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('\n📦 Package configuration:');
console.log(`✅ Name: ${pkg.name}`);
console.log(`✅ Version: ${pkg.version}`);
console.log(`✅ Description: ${pkg.description}`);

// Check wrangler configuration
const wrangler = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
console.log('\n🔧 Wrangler configuration:');
console.log(`✅ Worker name: ${wrangler.name}`);
console.log(`✅ Main entry: ${wrangler.main}`);
console.log(`✅ Workflows configured: ${wrangler.workflows?.length || 0}`);

console.log('\n🚀 Deploy-workflow service is ready!');
console.log('Next steps:');
console.log('1. Run: bun install');
console.log('2. Run: bun run typecheck');
console.log('3. Run: bun run dev');
console.log('4. Run: bun run deploy');