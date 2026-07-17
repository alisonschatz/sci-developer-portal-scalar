import fs from 'fs';
import path from 'path';

// Caminhos dos arquivos baixados/gerados que devem ser limpos
const targets = [
  { type: 'dir-content', path: 'src/base' },       // Onde o fetch salva as APIs brutas
  { type: 'dir-content', path: 'public/openapi' }, // Onde o Redocly gera os bundles finais
  { type: 'file', path: 'redocly.generated.yaml' } // Config gerada em tempo de execução
];

console.log('🧹 Limpando arquivos locais gerados pelas APIs...');

targets.forEach((target) => {
  const fullPath = path.resolve(target.path);

  if (!fs.existsSync(fullPath)) return;

  if (target.type === 'file') {
    fs.unlinkSync(fullPath);
    console.log(`🗑️  Arquivo removido: ${target.path}`);
  } else if (target.type === 'dir-content') {
    const files = fs.readdirSync(fullPath);
    files.forEach((file) => {
      // Evita apagar arquivos ocultos importantes como o .gitkeep
      if (file === '.gitkeep') return; 
      
      const filePath = path.join(fullPath, file);
      fs.rmSync(filePath, { recursive: true, force: true });
    });
    console.log(`🗑️  Conteúdo limpo em: ${target.path}/`);
  }
});

console.log('✨ Repositório limpo e pronto!');