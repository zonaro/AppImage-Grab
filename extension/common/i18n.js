/* Shared, dependency-free localization for both browser families and the MV3 worker.
 * Source phrases are the existing UI strings; translations never interpret HTML.
 * Template markers {{value}} preserve dynamic app names, URLs and counts.
 */
globalThis.AIGI18n = (() => {
  const browserApi = globalThis.browser || globalThis.chrome;
  function detect(value) {
    const code = String(value || '').replace('_', '-').toLowerCase();
    if (code === 'pt' || code.startsWith('pt-')) return 'pt_BR';
    if (code === 'es' || code.startsWith('es-')) return 'es';
    return 'en';
  }
  let uiLanguage = '';
  try { uiLanguage = browserApi?.i18n?.getUILanguage?.() || ''; } catch { /* API optional. */ }
  const language = detect(uiLanguage || globalThis.navigator?.language || 'en');
  const locale = {pt_BR: 'pt-BR', es: 'es', en: 'en'}[language];

  // Each entry: current Portuguese source, English fallback, Spanish translation.
  // English UI strings are registered as aliases to cover existing update banners.
  const phrases = [
    ['AppImages no navegador', 'AppImages in your browser', 'AppImages en tu navegador'],
    ['Integração automática', 'Automatic integration', 'Integración automática'],
    ['Desativada', 'Disabled', 'Desactivada'],
    ['Ativar integração automática', 'Enable automatic integration', 'Activar integración automática'],
    ['ON · aguardando downloads', 'ON · waiting for downloads', 'ON · esperando descargas'],
    ['OFF · downloads normais', 'OFF · normal downloads', 'OFF · descargas normales'],
    ['AppImage encontrada neste repositório', 'AppImage found in this repository', 'AppImage encontrada en este repositorio'],
    ['Escolha a AppImage e a arquitetura', 'Choose the AppImage and architecture', 'Elige la AppImage y la arquitectura'],
    ['Instalar no Gear Lever', 'Install with Gear Lever', 'Instalar con Gear Lever'],
    ['Ver no gerenciador', 'View in manager', 'Ver en el administrador'],
    ['Sugerir AppImages ao visitar repositórios', 'Suggest AppImages when visiting repositories', 'Sugerir AppImages al visitar repositorios'],
    ['Meus AppImages', 'My AppImages', 'Mis AppImages'],
    ['Meus AppImages — AppImage Grab', 'My AppImages — AppImage Grab', 'Mis AppImages — AppImage Grab'],
    ['Atualizar lista', 'Refresh list', 'Actualizar lista'],
    ['Carregando…', 'Loading…', 'Cargando…'],
    ['Gerenciar no navegador', 'Manage in browser', 'Administrar en el navegador'],
    ['Última atividade', 'Latest activity', 'Última actividad'],
    ['Nenhuma atividade ainda.', 'No activity yet.', 'Sin actividad todavía.'],
    ['O Gear Lever continua responsável pelas instalações e atualizações. A integração só roda com ON.',
      'Gear Lever still handles installations and updates. Automatic integration runs only when ON.',
      'Gear Lever sigue gestionando las instalaciones y actualizaciones. La integración automática solo funciona cuando está activada.'],
    ['Processando', 'Processing', 'Procesando'],
    ['Concluído', 'Completed', 'Completado'],
    ['Erro', 'Error', 'Error'],
    ['Consultando o Gear Lever…', 'Contacting Gear Lever…', 'Consultando Gear Lever…'],
    ['{{count}} integrado(s)', '{{count}} integrated', '{{count}} integrados'],
    ['Nenhuma AppImage integrada', 'No integrated AppImages', 'No hay AppImages integradas'],
    ['Sem fonte de atualização', 'No update source', 'Sin fuente de actualización'],
    ['Mais {{count}} no gerenciador…', '{{count}} more in the manager…', '{{count}} más en el administrador…'],
    ['Uma AppImage disponível nesta página.', 'One AppImage available on this page.', 'Una AppImage disponible en esta página.'],
    ['{{count}} AppImages disponíveis neste repositório.', '{{count}} AppImages available in this repository.', '{{count}} AppImages disponibles en este repositorio.'],
    ['arquitetura não identificada', 'unknown architecture', 'arquitectura desconocida'],
    ['Escolha a arquitetura correta antes de instalar.', 'Choose the correct architecture before installing.', 'Elige la arquitectura correcta antes de instalar.'],
    ['Baixar {{name}} e integrar ao Gear Lever?\nConfirme que você confia em {{provider}}.',
      'Download {{name}} and integrate with Gear Lever?\nConfirm that you trust {{provider}}.',
      '¿Descargar {{name}} e integrar con Gear Lever?\nConfirma que confías en {{provider}}.'],
    ['Iniciando download…', 'Starting download…', 'Iniciando descarga…'],
    ['Não foi possível iniciar o download', 'Could not start the download', 'No se pudo iniciar la descarga'],
    ['Download iniciado: {{name}}. Você receberá uma notificação após a confirmação do Gear Lever.',
      'Download started: {{name}}. You will be notified once Gear Lever confirms the integration.',
      'Descarga iniciada: {{name}}. Recibirás una notificación cuando Gear Lever confirme la integración.'],

    ['Gerenciador de AppImages', 'AppImage manager', 'Administrador de AppImages'],
    ['Navegação do gerenciador', 'Manager navigation', 'Navegación del administrador'],
    ['Instalados', 'Installed', 'Instalados'],
    ['Atualizações', 'Updates', 'Actualizaciones'],
    ['Loja', 'Store', 'Tienda'],
    ['Conectado ao Gear Lever local', 'Connected to local Gear Lever', 'Conectado a Gear Lever local'],
    ['Documentação e código ↗', 'Documentation and code ↗', 'Documentación y código ↗'],
    ['Interface web local. Os comandos são executados pelo Gear Lever através do serviço Native Messaging.',
      'Local web interface. Commands are executed by Gear Lever through the Native Messaging service.',
      'Interfaz web local. Gear Lever ejecuta los comandos mediante el servicio Native Messaging.'],
    ['Gerenciador /', 'Manager /', 'Administrador /'],
    ['Download automático', 'Automatic download', 'Descarga automática'],
    ['Atualizar loja', 'Refresh store', 'Actualizar tienda'],
    ['GERENCIADO PELO GEAR LEVER', 'MANAGED BY GEAR LEVER', 'GESTIONADO POR GEAR LEVER'],
    ['Todos os seus aplicativos em um só lugar. Consulte versões, verifique atualizações e gerencie fontes sem sair do navegador.',
      'All your apps in one place. Check versions, find updates and manage sources without leaving the browser.',
      'Todas tus aplicaciones en un solo lugar. Consulta versiones, busca actualizaciones y gestiona fuentes sin salir del navegador.'],
    ['Resumo', 'Summary', 'Resumen'],
    ['Com fonte de atualização', 'With update source', 'Con fuente de actualización'],
    ['Atualizações encontradas', 'Updates found', 'Actualizaciones encontradas'],
    ['Adicionar AppImage por link', 'Add AppImage by link', 'Añadir AppImage mediante enlace'],
    ['Cole um repositório/release do GitHub, GitLab ou Codeberg, ou o link direto de uma AppImage.',
      'Paste a GitHub, GitLab or Codeberg repository/release, or a direct AppImage link.',
      'Pega un repositorio o release de GitHub, GitLab o Codeberg, o un enlace directo a una AppImage.'],
    ['Link da fonte do AppImage', 'AppImage source link', 'Enlace de origen de AppImage'],
    ['Buscar AppImages', 'Find AppImages', 'Buscar AppImages'],
    ['AppImages instalados', 'Installed AppImages', 'AppImages instaladas'],
    ['Arquivo para baixar', 'File to download', 'Archivo para descargar'],
    ['Baixar e adicionar ao Gear Lever', 'Download and add to Gear Lever', 'Descargar y añadir a Gear Lever'],
    ['O navegador fará o download; a extensão confirmará a integração pelo Gear Lever. Escolha a arquitetura correta e instale apenas arquivos de fontes confiáveis.',
      'The browser downloads the file; the extension confirms integration through Gear Lever. Choose the correct architecture and only install files from trusted sources.',
      'El navegador descargará el archivo; la extensión confirmará la integración mediante Gear Lever. Elige la arquitectura correcta e instala solo archivos de fuentes fiables.'],
    ['Aplicativos instalados', 'Installed applications', 'Aplicaciones instaladas'],
    ['Carregando aplicativos do Gear Lever…', 'Loading Gear Lever apps…', 'Cargando aplicaciones de Gear Lever…'],
    ['Verificar atualizações', 'Check for updates', 'Buscar actualizaciones'],
    ['Buscar aplicativo ou arquivo…', 'Search app or file…', 'Buscar aplicación o archivo…'],
    ['Filtro', 'Filter', 'Filtro'],
    ['Todos', 'All', 'Todos'],
    ['Com atualização', 'With updates', 'Con actualizaciones'],
    ['O Gear Lever permanece no controle.', 'Gear Lever stays in control.', 'Gear Lever mantiene el control.'],
    ['Esta interface usa as operações oficiais da CLI do Gear Lever. Atualizações, alterações nas fontes e remoções só são realizadas mediante sua confirmação. A remoção usa a lixeira padrão do Gear Lever.',
      'This interface uses official Gear Lever CLI operations. Updates, source changes and removal always require your confirmation. Removal uses the Gear Lever trash.',
      'Esta interfaz usa las operaciones oficiales de la CLI de Gear Lever. Las actualizaciones, los cambios de fuente y las eliminaciones requieren tu confirmación. Los archivos se envían a la papelera de Gear Lever.'],
    ['DESCUBRA NOVOS APLICATIVOS', 'DISCOVER NEW APPS', 'DESCUBRE NUEVAS APLICACIONES'],
    ['Loja de AppImages', 'AppImage Store', 'Tienda de AppImages'],
    ['Explore os catálogos do AppImagePool e AppImageHub. Escolha a arquitetura e confirme o download para integrar ao Gear Lever.',
      'Explore AppImagePool and AppImageHub catalogs. Choose the architecture and confirm the download to integrate with Gear Lever.',
      'Explora los catálogos de AppImagePool y AppImageHub. Elige la arquitectura y confirma la descarga para integrar con Gear Lever.'],
    ['CATÁLOGOS DA COMUNIDADE', 'COMMUNITY CATALOGS', 'CATÁLOGOS DE LA COMUNIDAD'],
    ['Explorar aplicativos', 'Explore applications', 'Explorar aplicaciones'],
    ['Os arquivos vêm dos seus respectivos desenvolvedores ou do AppImageHub.',
      'Files come from their respective developers or AppImageHub.',
      'Los archivos provienen de sus respectivos desarrolladores o de AppImageHub.'],
    ['↻ Recarregar fontes', '↻ Reload sources', '↻ Recargar fuentes'],
    ['Buscar aplicativo', 'Search applications', 'Buscar aplicaciones'],
    ['Ex.: editor, música, vídeo…', 'E.g. editor, music, video…', 'Ej.: editor, música, vídeo…'],
    ['Fonte', 'Source', 'Fuente'],
    ['Ambas as fontes', 'Both sources', 'Ambas fuentes'],
    ['Categoria', 'Category', 'Categoría'],
    ['Todas as categorias', 'All categories', 'Todas las categorías'],
    ['Ordenar', 'Sort', 'Ordenar'],
    ['Nome (A–Z)', 'Name (A–Z)', 'Nombre (A–Z)'],
    ['Mais recentes', 'Most recent', 'Más recientes'],
    ['Mais populares', 'Most popular', 'Más populares'],
    ['AppImagePool: aguardando…', 'AppImagePool: waiting…', 'AppImagePool: esperando…'],
    ['AppImageHub: aguardando…', 'AppImageHub: waiting…', 'AppImageHub: esperando…'],
    ['Carregando catálogo…', 'Loading catalog…', 'Cargando catálogo…'],
    ['Catálogos externos: confira a origem antes de instalar.', 'External catalogs: verify the source before installing.', 'Catálogos externos: verifica el origen antes de instalar.'],
    ['Carregar mais aplicativos', 'Load more applications', 'Cargar más aplicaciones'],
    ['Downloads sob seu controle.', 'Downloads under your control.', 'Descargas bajo tu control.'],
    ['A loja não executa AppImages e não inicia downloads automaticamente. Alguns registros têm apenas um link externo; a integração só é confirmada pelo Gear Lever.',
      'The store does not run AppImages or download automatically. Some listings have only an external link; integration is confirmed exclusively by Gear Lever.',
      'La tienda no ejecuta AppImages ni descarga automáticamente. Algunas fichas solo tienen un enlace externo; la integración solo se confirma mediante Gear Lever.'],
    ['FONTE DE ATUALIZAÇÃO', 'UPDATE SOURCE', 'FUENTE DE ACTUALIZACIÓN'],
    ['Configurar fonte', 'Configure source', 'Configurar fuente'],
    ['Fechar', 'Close', 'Cerrar'],
    ['Informe a origem exata do aplicativo. O padrão de arquivo pode usar um',
      'Enter the exact app source. The filename pattern may use a',
      'Indica el origen exacto de la aplicación. El patrón de archivo puede usar un'],
    ['na posição da versão, preservando a arquitetura, por exemplo:',
      'at the version position while preserving the architecture, for example:',
      'en la posición de la versión, conservando la arquitectura, por ejemplo:'],
    ['Tipo de fonte', 'Source type', 'Tipo de fuente'],
    ['URL estática HTTPS', 'Static HTTPS URL', 'URL HTTPS estática'],
    ['Repositório / projeto', 'Repository / project', 'Repositorio / proyecto'],
    ['Nome do asset no release', 'Release asset name', 'Nombre del archivo de release'],
    ['Incluir pré-lançamentos', 'Include pre-releases', 'Incluir versiones preliminares'],
    ['URL de download HTTPS', 'HTTPS download URL', 'URL de descarga HTTPS'],
    ['Remover fonte personalizada', 'Remove custom source', 'Eliminar fuente personalizada'],
    ['Cancelar', 'Cancel', 'Cancelar'],
    ['Salvar fonte', 'Save source', 'Guardar fuente'],
    ['CATÁLOGO', 'CATALOG', 'CATÁLOGO'],
    ['Aplicativo', 'Application', 'Aplicación'],
    ['Arquivo / arquitetura', 'File / architecture', 'Archivo / arquitectura'],
    ['Ver página oficial ↗', 'View official page ↗', 'Ver página oficial ↗'],
    ['Baixar e integrar', 'Download and integrate', 'Descargar e integrar'],
    ['usuario/repositorio', 'user/repository', 'usuario/repositorio'],
    ['https://exemplo.org/app.AppImage', 'https://example.org/app.AppImage', 'https://ejemplo.org/app.AppImage'],

    ['{{count}} aplicativo(s) integrados ao Gear Lever', '{{count}} apps integrated with Gear Lever', '{{count}} aplicaciones integradas con Gear Lever'],
    ['Atualizações disponíveis', 'Available updates', 'Actualizaciones disponibles'],
    ['Clique em "Verificar atualizações" para consultar o Gear Lever.', 'Click "Check for updates" to query Gear Lever.', 'Haz clic en «Buscar actualizaciones» para consultar Gear Lever.'],
    ['Nenhuma atualização encontrada para este filtro.', 'No updates found for this filter.', 'No se encontraron actualizaciones para este filtro.'],
    ['Nenhum aplicativo corresponde à sua busca.', 'No apps match your search.', 'Ninguna aplicación coincide con tu búsqueda.'],
    ['Nenhuma AppImage integrada ao Gear Lever.', 'No AppImages integrated with Gear Lever.', 'No hay AppImages integradas con Gear Lever.'],
    ['Nova versão', 'New version', 'Nueva versión'],
    ['Em execução', 'Running', 'En ejecución'],
    ['Versão: {{version}}', 'Version: {{version}}', 'Versión: {{version}}'],
    ['Versão não informada', 'Version unavailable', 'Versión no disponible'],
    ['Fonte: {{source}}', 'Source: {{source}}', 'Fuente: {{source}}'],
    ['Fonte incorporada ao AppImage', 'Source embedded in AppImage', 'Fuente integrada en AppImage'],
    ['Configuração da fonte não pôde ser recuperada; somente leitura', 'Could not retrieve source settings; read only', 'No se pudo recuperar la configuración de la fuente; solo lectura'],
    ['Atualizar', 'Update', 'Actualizar'],
    ['Fonte embutida', 'Embedded source', 'Fuente integrada'],
    ['Remover', 'Remove', 'Eliminar'],
    ['Aplicativos carregados.', 'Applications loaded.', 'Aplicaciones cargadas.'],
    ['Consultando aplicativos instalados…', 'Loading installed applications…', 'Consultando aplicaciones instaladas…'],
    ['A lista de atualizações do Gear Lever é inválida.', 'Gear Lever returned an invalid update list.', 'Gear Lever devolvió una lista de actualizaciones no válida.'],
    ['{{count}} atualização(ões) confirmada(s) pelo Gear Lever.', '{{count}} updates confirmed by Gear Lever.', '{{count}} actualizaciones confirmadas por Gear Lever.'],
    ['Verificando atualizações no Gear Lever…', 'Checking for updates with Gear Lever…', 'Buscando actualizaciones con Gear Lever…'],
    ['Atualizar "{{name}}" pelo Gear Lever? Uma nova verificação será feita antes de atualizar.',
      'Update "{{name}}" through Gear Lever? Updates will be checked again first.',
      '¿Actualizar «{{name}}» mediante Gear Lever? Se comprobarán las actualizaciones de nuevo antes de continuar.'],
    ['Atualização concluída: {{name}}', 'Update completed: {{name}}', 'Actualización completada: {{name}}'],
    ['Atualizando {{name}}…', 'Updating {{name}}…', 'Actualizando {{name}}…'],
    ['Mover "{{name}}" para a lixeira usando o Gear Lever?', 'Move "{{name}}" to the trash with Gear Lever?', '¿Mover «{{name}}» a la papelera mediante Gear Lever?'],
    ['Removido pelo Gear Lever: {{name}}', 'Removed by Gear Lever: {{name}}', 'Eliminado por Gear Lever: {{name}}'],
    ['Removendo {{name}}…', 'Removing {{name}}…', 'Eliminando {{name}}…'],
    ['URL do projeto GitLab', 'GitLab project URL', 'URL del proyecto GitLab'],
    ['Repositório (usuário/repositório)', 'Repository (user/repository)', 'Repositorio (usuario/repositorio)'],
    ['Gerenciador existente no Gear Lever: {{name}}', 'Existing Gear Lever source manager: {{name}}', 'Gestor de fuentes existente en Gear Lever: {{name}}'],
    ['Nenhuma fonte configurada no Gear Lever.', 'No source configured in Gear Lever.', 'No hay ninguna fuente configurada en Gear Lever.'],
    ['O Gear Lever usa uma fonte embutida neste AppImage, que não pode ser editada por aqui.',
      'Gear Lever uses a source embedded in this AppImage, which cannot be edited here.',
      'Gear Lever utiliza una fuente integrada en esta AppImage, que no se puede editar aquí.'],
    ['Este gerenciador não tem editor nesta extensão. As informações existentes permanecem preservadas.',
      'This source manager has no editor in this extension. Existing settings are preserved.',
      'Este gestor de fuentes no tiene editor en la extensión. La configuración existente se conserva.'],
    ['Não foi possível recuperar com segurança a configuração já existente do Gear Lever. Edição e remoção estão bloqueadas para evitar perda de dados.',
      'The existing Gear Lever settings could not be safely retrieved. Editing and removal are blocked to prevent data loss.',
      'No se pudo recuperar de forma segura la configuración existente de Gear Lever. Se bloquean la edición y la eliminación para evitar pérdidas de datos.'],
    ['Substituir a fonte de atualização de "{{name}}"?', 'Replace the update source for "{{name}}"?', '¿Sustituir la fuente de actualización de «{{name}}»?'],
    ['Fonte salva no Gear Lever para {{name}}', 'Source saved in Gear Lever for {{name}}', 'Fuente guardada en Gear Lever para {{name}}'],
    ['Remover a fonte personalizada de "{{name}}"?', 'Remove the custom source for "{{name}}"?', '¿Eliminar la fuente personalizada de «{{name}}»?'],
    ['Fonte personalizada removida de {{name}}', 'Custom source removed from {{name}}', 'Fuente personalizada eliminada de {{name}}'],
    ['AppImage adicionada ao Gear Lever.', 'AppImage added to Gear Lever.', 'AppImage añadida a Gear Lever.'],
    ['Ocorreu um erro na integração.', 'An integration error occurred.', 'Se produjo un error de integración.'],
    ['Consultando a fonte…', 'Checking source…', 'Consultando la fuente…'],
    ['Nenhuma AppImage compatível', 'No compatible AppImages', 'No hay AppImages compatibles'],
    ['{{count}} AppImage(s) encontrada(s). Confira a arquitetura antes de baixar.',
      '{{count}} AppImages found. Check the architecture before downloading.',
      '{{count}} AppImages encontradas. Comprueba la arquitectura antes de descargar.'],
    ['Não foi possível identificar a fonte: {{error}}', 'Could not identify the source: {{error}}', 'No se pudo identificar la fuente: {{error}}'],
    ['Baixar "{{name}}" de {{source}} e adicionar ao Gear Lever? Confirme que você confia nesta origem.',
      'Download "{{name}}" from {{source}} and add it to Gear Lever? Confirm that you trust this source.',
      '¿Descargar «{{name}}» de {{source}} y añadirla a Gear Lever? Confirma que confías en esta fuente.'],
    ['Iniciando download no navegador…', 'Starting browser download…', 'Iniciando descarga en el navegador…'],
    ['Falha ao iniciar download', 'Failed to start download', 'No se pudo iniciar la descarga'],
    ['Download iniciado: {{name}}. Uma notificação confirmará quando o Gear Lever concluir a integração.',
      'Download started: {{name}}. A notification will confirm when Gear Lever completes integration.',
      'Descarga iniciada: {{name}}. Una notificación confirmará cuando Gear Lever complete la integración.'],
    ['Não foi possível baixar: {{error}}', 'Could not download: {{error}}', 'No se pudo descargar: {{error}}'],

    ['Catálogo maior que o permitido', 'Catalog exceeds the size limit', 'El catálogo supera el límite de tamaño'],
    ['Sem descrição disponível.', 'No description available.', 'Sin descripción disponible.'],
    ['Ver detalhes', 'View details', 'Ver detalles'],
    ['AppImage Catalog: carregando…', 'AppImage Catalog: loading…', 'AppImage Catalog: cargando…'],
    ['AppImageHub: carregando…', 'AppImageHub: loading…', 'AppImageHub: cargando…'],
    ['AppImage Catalog: erro · {{error}}', 'AppImage Catalog: error · {{error}}', 'AppImage Catalog: error · {{error}}'],
    ['AppImageHub: erro · {{error}}', 'AppImageHub: error · {{error}}', 'AppImageHub: error · {{error}}'],
    ['AppImage Catalog: {{count}} aplicativos', 'AppImage Catalog: {{count}} applications', 'AppImage Catalog: {{count}} aplicaciones'],
    ['AppImageHub: {{count}} AppImages carregados', 'AppImageHub: {{count}} AppImages loaded', 'AppImageHub: {{count}} AppImages cargadas'],
    ['Carregando aplicativos…', 'Loading applications…', 'Cargando aplicaciones…'],
    ['Não foi possível carregar os catálogos. Tente novamente.', 'Could not load catalogs. Please try again.', 'No se pudieron cargar los catálogos. Inténtalo de nuevo.'],
    ['Nenhuma AppImage encontrada. Experimente outra busca ou fonte.', 'No AppImages found. Try another search or source.', 'No se encontraron AppImages. Prueba otra búsqueda o fuente.'],
    ['{{count}} resultado(s) exibido(s) · {{total}} correspondência(s) carregada(s)',
      '{{count}} results shown · {{total}} matches loaded', '{{count}} resultados mostrados · {{total}} coincidencias cargadas'],
    ['Formato de feed inválido', 'Invalid feed format', 'Formato de feed no válido'],
    ['Categorias do AppImageHub indisponíveis', 'AppImageHub categories unavailable', 'Categorías de AppImageHub no disponibles'],
    ['Selecione a arquitetura correta antes de baixar.', 'Select the correct architecture before downloading.', 'Selecciona la arquitectura correcta antes de descargar.'],
    ['Não há arquivo compatível para download direto. Abra a página de origem.',
      'No compatible file for direct download. Open the source page.',
      'No hay archivos compatibles para descarga directa. Abre la página de origen.'],
    ['Autor: {{name}}', 'Author: {{name}}', 'Autor: {{name}}'],
    ['Licença: {{name}}', 'License: {{name}}', 'Licencia: {{name}}'],
    ['Pontuação no catálogo: {{score}}', 'Catalog score: {{score}}', 'Puntuación en el catálogo: {{score}}'],
    ['Imagem de {{name}}', 'Image of {{name}}', 'Imagen de {{name}}'],
    ['Ícone de {{name}}', '{{name}} icon', 'Icono de {{name}}'],
    ['Buscando arquivos de release e arquiteturas…', 'Finding release files and architectures…', 'Buscando archivos de release y arquitecturas…'],
    ['Consultando arquivos disponíveis…', 'Checking available files…', 'Consultando archivos disponibles…'],
    ['Arquivos AppImage publicados no AppImageHub. Escolha a arquitetura e confirme a origem.',
      'AppImage files published on AppImageHub. Choose the architecture and confirm the source.',
      'Archivos AppImage publicados en AppImageHub. Elige la arquitectura y confirma el origen.'],
    ['Não foi possível verificar o release: {{error}}', 'Could not verify the release: {{error}}', 'No se pudo verificar el release: {{error}}'],
    ['Baixar "{{name}}" de {{source}} e integrar ao Gear Lever? Confirme que você confia no desenvolvedor e na arquitetura.',
      'Download "{{name}}" from {{source}} and integrate with Gear Lever? Confirm that you trust the developer and the architecture.',
      '¿Descargar «{{name}}» de {{source}} e integrar con Gear Lever? Confirma que confías en el desarrollador y la arquitectura.'],
    ['Download não iniciado', 'Download not started', 'Descarga no iniciada'],
    ['Download iniciado: {{name}}. A integração será confirmada pelo Gear Lever após concluir.',
      'Download started: {{name}}. Gear Lever will confirm integration when it is complete.',
      'Descarga iniciada: {{name}}. Gear Lever confirmará la integración cuando finalice.'],
    ['Falha ao baixar: {{error}}', 'Download failed: {{error}}', 'Error de descarga: {{error}}'],
    ['Não identificada', 'Unknown', 'Desconocida'],
    ['Resposta inválida do catálogo AppImageHub', 'Invalid AppImageHub catalog response', 'Respuesta no válida del catálogo de AppImageHub'],

    ['AppImage adicionada ao Gear Lever', 'AppImage added to Gear Lever', 'AppImage añadida a Gear Lever'],
    ['AppImage integrada; listagem pendente', 'AppImage integrated; listing pending', 'AppImage integrada; listado pendiente'],
    ['{{name}}: o Gear Lever confirmou a integração, mas ainda não listou o aplicativo.',
      '{{name}}: Gear Lever confirmed integration, but has not listed the app yet.',
      '{{name}}: Gear Lever confirmó la integración, pero todavía no muestra la aplicación.'],
    ['Gear Lever confirmou a integração, mas ainda não listou o aplicativo; confira o gerenciador.',
      'Gear Lever confirmed integration, but has not listed the app yet; check the manager.',
      'Gear Lever confirmó la integración, pero todavía no muestra la aplicación; comprueba el administrador.'],
    ['{{name}} foi integrada com sucesso.', '{{name}} was successfully integrated.', '{{name}} se integró correctamente.'],
    ["Histórico", "History", "Historial"],
    ["INSTALAÇÕES E DIAGNÓSTICO", "INSTALLATIONS AND DIAGNOSTICS", "INSTALACIONES Y DIAGNÓSTICO"],
    ["Histórico de atividades", "Activity history", "Historial de actividad"],
    ["Acompanhe downloads, integrações, atualizações e falhas. Os detalhes são salvos somente neste navegador, sem URLs privadas ou caminhos completos.", "Track downloads, integrations, updates and failures. Details stay in this browser, without private URLs or full paths.", "Consulta descargas, integraciones, actualizaciones y errores. Los detalles quedan en este navegador, sin URL privadas ni rutas completas."],
    ["Instalações e erros", "Installations and errors", "Instalaciones y errores"],
    ["Até 200 operações recentes. Clique em uma entrada para ver o motivo do erro.", "Up to 200 recent operations. Open an entry to see the cause of an error.", "Hasta 200 operaciones recientes. Abre una entrada para ver la causa del error."],
    ["Atualizar", "Refresh", "Actualizar"],
    ["Copiar relatório", "Copy report", "Copiar informe"],
    ["Limpar histórico", "Clear history", "Borrar historial"],
    ["Buscar no histórico", "Search history", "Buscar en el historial"],
    ["AppImage ou mensagem de erro…", "AppImage or error message…", "AppImage o mensaje de error…"],
    ["Filtrar resultado", "Filter by result", "Filtrar resultado"],
    ["Todos", "All", "Todos"],
    ["Erros", "Errors", "Errores"],
    ["Pendências", "Pending", "Pendientes"],
    ["Sucessos", "Successes", "Éxitos"],
    ["Em andamento", "In progress", "En curso"],
    ["Cancelados", "Cancelled", "Cancelados"],
    ["Log do serviço local", "Local service log", "Registro del servicio local"],
    ["Erros anteriores registrados pelo AppImage Grab no host.log. Não é o log interno do Gear Lever.", "Previous errors recorded by AppImage Grab in host.log. This is not Gear Lever's own log.", "Errores previos registrados por AppImage Grab en host.log. No es el registro interno de Gear Lever."],
    ["Consultar log local", "Read local log", "Consultar registro local"],
    ["Aguardando", "Waiting", "Esperando"],
    ["Baixando", "Downloading", "Descargando"],
    ["Integrando", "Integrating", "Integrando"],
    ["Pendente", "Pending", "Pendiente"],
    ["Cancelado", "Cancelled", "Cancelado"],
    ["Já processado", "Already processed", "Ya procesado"],
    ["Download", "Download", "Descarga"],
    ["Integração", "Integration", "Integración"],
    ["Detalhes", "Details", "Detalles"],
    ["Sem detalhes adicionais.", "No further details.", "Sin más detalles."],
    ["{{count}} registro(s) encontrado(s).", "{{count}} entries found.", "{{count}} registros encontrados."],
    ["Nenhum registro encontrado para este filtro.", "No entries found for this filter.", "No se encontraron registros para este filtro."],
    ["{{count}} erro(s) do serviço local.", "{{count}} local service errors.", "{{count}} errores del servicio local."],
    ["Nenhum erro anterior encontrado no log local.", "No previous errors found in the local log.", "No se encontraron errores previos en el registro local."],
    ["Aviso", "Warning", "Aviso"],
    ["Não foi possível ler o histórico: ", "Could not read history: ", "No se pudo leer el historial: "],
    ["Serviço local indisponível: ", "Local service unavailable: ", "Servicio local no disponible: "],
    ["Relatório copiado.", "Report copied.", "Informe copiado."],
    ["Não foi possível copiar: ", "Could not copy: ", "No se pudo copiar: "],
    ["Limpar os registros de instalação deste navegador? O log do serviço local será preservado.", "Clear installation records from this browser? The local service log will be preserved.", "¿Borrar los registros de instalación de este navegador? Se conservará el registro del servicio local."],
    ["Histórico limpo.", "History cleared.", "Historial borrado."],
    ['Notificações', 'Notifications', 'Notificaciones'],
    ['Notificações e diagnóstico', 'Notifications and diagnostics', 'Notificaciones y diagnóstico'],
    ['AVISOS DO NAVEGADOR', 'BROWSER ALERTS', 'AVISOS DEL NAVEGADOR'],
    ['Controle cada tipo de aviso. A entrega depende das permissões do navegador e do sistema operacional.',
      'Control each alert type. Delivery depends on browser and operating system permissions.',
      'Controla cada tipo de aviso. La entrega depende de los permisos del navegador y del sistema operativo.'],
    ['Preferências', 'Preferences', 'Preferencias'],
    ['Essas opções são independentes do download automático.',
      'These options are independent of automatic downloads.',
      'Estas opciones son independientes de las descargas automáticas.'],
    ['Sugestões em repositórios', 'Repository suggestions', 'Sugerencias en repositorios'],
    ['Sugestões', 'Suggestions', 'Sugerencias'],
    ['Sugestões desativadas', 'Suggestions disabled', 'Sugerencias desactivadas'],
    ['Sugestão já exibida nas últimas 24 horas',
      'Suggestion already sent in the last 24 hours',
      'Sugerencia ya enviada en las últimas 24 horas'],
    ['Nenhuma AppImage verificada nesse repositório',
      'No verified AppImage in this repository',
      'No hay AppImages verificadas en este repositorio'],
    ['Você saiu da aba antes da sugestão',
      'You left the tab before the suggestion',
      'Saliste de la pestaña antes de la sugerencia'],
    ['Sugestão enviada ao navegador', 'Suggestion sent to browser', 'Sugerencia enviada al navegador'],
    ['Sugestão bloqueada pelo navegador', 'Suggestion blocked by browser', 'Sugerencia bloqueada por el navegador'],
    ['Erro ao verificar sugestão', 'Error checking suggestion', 'Error al comprobar la sugerencia'],
    ['AppImage integrada', 'AppImage integrated', 'AppImage integrada'],
    ['Erros de integração', 'Integration errors', 'Errores de integración'],
    ['Atualização concluída', 'Update completed', 'Actualización completada'],
    ['Erros de atualização', 'Update errors', 'Errores de actualización'],
    ['Enviar notificação de teste', 'Send test notification', 'Enviar notificación de prueba'],
    ['Verificar atualizações agora', 'Check for updates now', 'Buscar actualizaciones ahora'],
    ['Limpar histórico', 'Clear history', 'Borrar historial'],
    ['Histórico de notificações', 'Notification history', 'Historial de notificaciones'],
    ['Os últimos 50 avisos, sem caminhos completos ou URLs privadas.',
      'The last 50 alerts, without full paths or private URLs.',
      'Los últimos 50 avisos, sin rutas completas ni URL privadas.'],
    ['Uma chamada aceita pela API não garante que a notificação apareceu. Confira também o modo Não Perturbe e as permissões do navegador no GNOME.',
      'An accepted API call does not guarantee that the alert appeared. Also check Do Not Disturb and browser permissions in GNOME.',
      'Una llamada aceptada por la API no garantiza que el aviso aparezca. Comprueba también No molestar y los permisos del navegador en GNOME.'],
    ['Nenhuma notificação registrada.', 'No notifications recorded.', 'No hay notificaciones registradas.'],
    ['Solicitada ao navegador', 'Requested from browser', 'Solicitada al navegador'],
    ['Exibida (confirmada pela API)', 'Shown (API confirmed)', 'Mostrada (confirmada por la API)'],
    ['Bloqueada', 'Blocked', 'Bloqueada'],
    ['Erro ao solicitar', 'Request error', 'Error al solicitar'],
    ['Bloqueada pelo navegador', 'Blocked by browser', 'Bloqueada por el navegador'],
    ['Autorizada no navegador', 'Allowed by browser', 'Autorizada en el navegador'],
    ['Permissão não consultável', 'Permission status unavailable', 'Estado del permiso no disponible'],
    ['Permissão', 'Permission', 'Permiso'],
    ['Serviço local', 'Local service', 'Servicio local'],
    ['Build', 'Build', 'Compilación'],
    ['desconhecido', 'unknown', 'desconocido'],
    ['Conectado', 'Connected', 'Conectado'],
    ['Indisponível', 'Unavailable', 'No disponible'],
    ['Nenhuma checagem de AppImages registrada', 'No AppImage checks recorded', 'No hay comprobaciones de AppImage registradas'],
    ['Última checagem falhou', 'Last check failed', 'La última comprobación falló'],
    ['{{count}} atualização(ões) na última checagem', '{{count}} updates in last check', '{{count}} actualizaciones en la última comprobación'],
    ['Atualizar histórico', 'Refresh history', 'Actualizar historial'],
    ['Preferências salvas.', 'Preferences saved.', 'Preferencias guardadas.'],
    ['Não foi possível salvar as preferências.', 'Could not save preferences.', 'No se pudieron guardar las preferencias.'],
    ['Notificações bloqueadas pelo navegador.', 'Notifications blocked by browser.', 'Notificaciones bloqueadas por el navegador.'],
    ['Falha ao solicitar a notificação.', 'Could not request notification.', 'No se pudo solicitar la notificación.'],
    ['Aviso solicitado. Confira as notificações do seu desktop.',
      'Alert requested. Check your desktop notifications.',
      'Aviso solicitado. Comprueba las notificaciones de tu escritorio.'],
    ['Ative avisos de atualização para verificar.', 'Enable update alerts to check.', 'Activa los avisos de actualización para comprobar.'],
    ['Histórico limpo.', 'History cleared.', 'Historial borrado.'],
    ['Diagnóstico indisponível: {{error}}', 'Diagnostics unavailable: {{error}}', 'Diagnóstico no disponible: {{error}}'],
    ['Falha no teste: {{error}}', 'Test failed: {{error}}', 'Error en la prueba: {{error}}'],
    ['Não foi possível verificar atualizações: {{error}}',
      'Could not check for updates: {{error}}',
      'No se pudieron comprobar las actualizaciones: {{error}}'],
    ['Teste de notificação AppImage Grab', 'AppImage Grab notification test', 'Prueba de notificación de AppImage Grab'],
    ['Se você está vendo esta mensagem, os avisos do navegador estão aparecendo.',
      'If you can see this message, browser alerts are appearing.',
      'Si puedes ver este mensaje, los avisos del navegador están apareciendo.'],
    ['Erro ao integrar AppImage', 'AppImage integration failed', 'Error al integrar AppImage'],
    ['Integração parcial da AppImage', 'Partial AppImage integration', 'Integración parcial de AppImage'],
    ['{{name}}: confira a fonte de atualização no gerenciador.',
      '{{name}}: check the update source in the manager.',
      '{{name}}: comprueba la fuente de actualización en el administrador.'],
    ['{{name}}: abra o gerenciador para conferir o erro.',
      '{{name}}: open the manager to check the error.',
      '{{name}}: abre el administrador para comprobar el error.'],
    ['Atualização de AppImage disponível', 'AppImage update available', 'Actualización de AppImage disponible'],
    ['{{name}}: versão {{version}}', '{{name}}: version {{version}}', '{{name}}: versión {{version}}'],
    ['{{name}}: nova versão confirmada pelo Gear Lever.',
      '{{name}}: new version confirmed by Gear Lever.',
      '{{name}}: nueva versión confirmada por Gear Lever.'],
    ['AppImage atualizada', 'AppImage updated', 'AppImage actualizada'],
    ['{{name}} foi atualizada com sucesso.', '{{name}} was successfully updated.', '{{name}} se actualizó correctamente.'],
    ['Falha ao atualizar AppImage', 'AppImage update failed', 'Error al actualizar AppImage'],
    ['{{name}}: confira os detalhes no gerenciador.',
      '{{name}}: check details in the manager.',
      '{{name}}: comprueba los detalles en el administrador.'],
    ['O navegador não iniciou o download', 'The browser did not start the download', 'El navegador no inició la descarga'],
    ['Arquivo não pertence à fonte selecionada', 'File does not belong to the selected source', 'El archivo no pertenece a la fuente seleccionada'],
    ['Confirmação de download obrigatória', 'Download confirmation required', 'Se requiere confirmación de descarga'],
    ['Arquivo do catálogo inválido', 'Invalid catalog file', 'Archivo de catálogo no válido'],
    ['Não foi possível conferir o registro no AppImageHub', 'Could not verify the AppImageHub listing', 'No se pudo verificar la ficha de AppImageHub'],
    ['Resposta do catálogo muito grande', 'Catalog response too large', 'Respuesta del catálogo demasiado grande'],
    ['Dados do AppImageHub inválidos', 'Invalid AppImageHub data', 'Datos de AppImageHub no válidos'],
    ['Registro não encontrado no catálogo', 'Listing not found in catalog', 'Ficha no encontrada en el catálogo'],
    ['AppImage não está mais disponível no catálogo', 'AppImage is no longer available in the catalog', 'AppImage ya no está disponible en el catálogo'],
    ['URL de download inválida', 'Invalid download URL', 'URL de descarga no válida'],
    ['Origem do AppImageHub não é segura', 'Unsafe AppImageHub source', 'Origen de AppImageHub no seguro'],
    ['O nome do arquivo não corresponde ao download', 'Filename does not match the download', 'El nombre del archivo no coincide con la descarga'],
    ['Arquivo em origem externa não validada. Abra a página do AppImageHub.',
      'File from an unverified external source. Open its AppImageHub page.',
      'Archivo de una fuente externa no verificada. Abre su página de AppImageHub.'],
    ['O release do provedor não confirmou este arquivo', 'Provider release did not confirm this file', 'El release del proveedor no confirmó este archivo'],
    ['Serviço local indisponível', 'Local service unavailable', 'Servicio local no disponible'],
    ['Download da AppImage interrompido ou cancelado', 'AppImage download interrupted or canceled', 'Descarga de AppImage interrumpida o cancelada'],
    ['Falha não identificada', 'Unknown failure', 'Error desconocido'],
    ['O Gear Lever não confirmou uma integração concluída', 'Gear Lever did not confirm successful integration', 'Gear Lever no confirmó que se completara la integración'],
    ['Integrado com atualizações: {{source}}', 'Integrated with updates: {{source}}', 'Integrada con actualizaciones: {{source}}'],
    ['Integrado; fonte existente preservada', 'Integrated; existing source preserved', 'Integrada; fuente existente conservada'],
    ['Arquivo já processado', 'File already processed', 'Archivo ya procesado'],
    ['Integrado sem fonte automática (origem não identificada)', 'Integrated without automatic source (unknown origin)', 'Integrada sin fuente automática (origen desconocido)'],
    ['AppImage disponível neste repositório', 'AppImage available in this repository', 'AppImage disponible en este repositorio'],
    ['{{name}} pode ser adicionada ao Gear Lever.', '{{name}} can be added to Gear Lever.', '{{name}} puede añadirse a Gear Lever.'],
    ['{{count}} AppImages encontradas em {{repository}}. Escolha a arquitetura correta.',
      '{{count}} AppImages found in {{repository}}. Choose the correct architecture.',
      '{{count}} AppImages encontradas en {{repository}}. Elige la arquitectura correcta.'],
    ['Ver e instalar', 'View and install', 'Ver e instalar'],
    ['Escolher AppImage', 'Choose AppImage', 'Elegir AppImage'],
    ['O Gear Lever demorou muito a responder.', 'Gear Lever took too long to respond.', 'Gear Lever tardó demasiado en responder.'],
    ['Erro inesperado do serviço local', 'Unexpected local service error', 'Error inesperado del servicio local'],
    ['Conexão com o serviço AppImage Grab indisponível. Execute o instalador novamente.',
      'Cannot connect to the AppImage Grab service. Run the installer again.',
      'No se puede conectar con el servicio AppImage Grab. Ejecuta el instalador de nuevo.'],

    // Error messages returned by the local Python bridge and displayed by the UI.
    ['Origem da API não confiável', 'Untrusted API source', 'Origen de API no fiable'],
    ['Não foi possível consultar o release do GitHub', 'Could not fetch the GitHub release', 'No se pudo consultar el release de GitHub'],
    ['Release não encontrado', 'Release not found', 'Release no encontrado'],
    ['O release não contém AppImages compatíveis', 'The release contains no compatible AppImages', 'El release no contiene AppImages compatibles'],
    ['Release inválido', 'Invalid release', 'Release no válido'],
    ['Não foi possível consultar o release do provedor', 'Could not fetch the provider release', 'No se pudo consultar el release del proveedor'],
    ['Nenhuma AppImage compatível no release do GitLab', 'No compatible AppImages in the GitLab release', 'No hay AppImages compatibles en el release de GitLab'],
    ['Tag do release inválida', 'Invalid release tag', 'Etiqueta de release no válida'],
    ['Nenhuma AppImage compatível no release do Codeberg', 'No compatible AppImages in the Codeberg release', 'No hay AppImages compatibles en el release de Codeberg'],
    ['Cole um link HTTPS de um release compatível', 'Paste an HTTPS link to a compatible release', 'Pega un enlace HTTPS a un release compatible'],
    ['Link inválido', 'Invalid link', 'Enlace no válido'],
    ['Use um link HTTPS público', 'Use a public HTTPS link', 'Utiliza un enlace HTTPS público'],
    ['Link incompatível: use uma AppImage direta ou uma página de releases do GitHub, GitLab ou Codeberg',
      'Unsupported link: use a direct AppImage link or a GitHub, GitLab or Codeberg releases page',
      'Enlace incompatible: utiliza una AppImage directa o una página de releases de GitHub, GitLab o Codeberg'],
    ['A CLI instalada não oferece --list-updates --json (schema 1).',
      'The installed CLI does not support --list-updates --json (schema 1).',
      'La CLI instalada no admite --list-updates --json (schema 1).'],
    ['Caminho inválido', 'Invalid path', 'Ruta no válida'],
    ['AppImage não está integrada no Gear Lever', 'AppImage is not integrated with Gear Lever', 'La AppImage no está integrada con Gear Lever'],
    ['O Gear Lever não confirma atualização disponível para este AppImage',
      'Gear Lever does not confirm an available update for this AppImage',
      'Gear Lever no confirma que haya una actualización disponible para esta AppImage'],
    ['Configuração inválida', 'Invalid configuration', 'Configuración no válida'],
    ['Chaves de configuração inválidas', 'Invalid configuration keys', 'Claves de configuración no válidas'],
    ['Use o formato usuário/repositório', 'Use the user/repository format', 'Utiliza el formato usuario/repositorio'],
    ['Padrão de nome de arquivo inválido', 'Invalid filename pattern', 'Patrón de nombre de archivo no válido'],
    ['Pré-lançamentos devem ser true/false', 'Pre-releases must be true/false', 'Las versiones preliminares deben ser true/false'],
    ['URL inválida', 'Invalid URL', 'URL no válida'],
    ['Informe uma URL de projeto válida do GitLab', 'Enter a valid GitLab project URL', 'Introduce una URL de proyecto de GitLab válida'],
    ['Use uma URL HTTPS pública', 'Use a public HTTPS URL', 'Utiliza una URL HTTPS pública'],
    ['Gerenciador não suportado pela interface', 'Source manager is not supported by this interface', 'El gestor de fuentes no es compatible con esta interfaz'],
    ['A configuração existente não foi recuperada com segurança; alteração bloqueada',
      'Existing settings could not be safely retrieved; changes are blocked',
      'No se pudo recuperar de forma segura la configuración existente; los cambios están bloqueados'],
    ['Não é possível remover uma fonte embutida', 'Cannot remove an embedded source', 'No se puede eliminar una fuente integrada'],
    ['A configuração existente não foi recuperada com segurança; remoção bloqueada',
      'Existing settings could not be safely retrieved; removal is blocked',
      'No se pudo recuperar de forma segura la configuración existente; la eliminación está bloqueada'],
    ['Cabeçalho incompleto', 'Incomplete header', 'Cabecera incompleta'],
    ['Tamanho inválido', 'Invalid size', 'Tamaño no válido'],
    ['Mensagem não é um objeto', 'Message is not an object', 'El mensaje no es un objeto'],
    ['Caminho de arquivo inválido', 'Invalid file path', 'Ruta de archivo no válida'],
    ['O download não é uma AppImage absoluta', 'Download is not an absolute AppImage path', 'La descarga no es una ruta absoluta de AppImage'],
    ['AppImage deve ser arquivo regular pertencente ao usuário (sem symlinks)',
      'AppImage must be a regular user-owned file (no symlinks)',
      'La AppImage debe ser un archivo normal propiedad del usuario (sin enlaces simbólicos)'],
    ['Arquivo não possui assinatura de AppImage Tipo 1 ou 2',
      'File has no AppImage Type 1 or Type 2 signature',
      'El archivo no tiene firma AppImage de tipo 1 o 2'],
    ['Somente downloads HTTPS são processados automaticamente',
      'Only HTTPS downloads are processed automatically',
      'Solo se procesan automáticamente las descargas HTTPS'],
    ['Ação inválida', 'Invalid action', 'Acción no válida'],
    ['Confirmação explícita obrigatória', 'Explicit confirmation required', 'Se requiere confirmación explícita'],
    ['Gear Lever não encontrado. Instale o Flatpak it.mijorus.gearlever.',
      'Gear Lever not found. Install the it.mijorus.gearlever Flatpak.',
      'No se encontró Gear Lever. Instala el Flatpak it.mijorus.gearlever.'],
    ['A versão instalada do Gear Lever não oferece --list-installed --json (schema 1).',
      'The installed Gear Lever version does not support --list-installed --json (schema 1).',
      'La versión instalada de Gear Lever no admite --list-installed --json (schema 1).'],
    ['A integração ocorreu, mas não foi possível identificar sua entrada com segurança.',
      'Integration succeeded, but its entry could not be safely identified.',
      'La integración se completó, pero no se pudo identificar la entrada de forma segura.'],
    ['A entrada criada pelo Gear Lever não possui arquivo válido.',
      'The Gear Lever entry has no valid file.',
      'La entrada creada por Gear Lever no tiene un archivo válido.'],
    ['Integrado em {{destination}}, mas não foi possível registrar atualizações: {{error}}',
      'Integrated in {{destination}}, but could not configure updates: {{error}}',
      'Integrada en {{destination}}, pero no se pudieron configurar las actualizaciones: {{error}}'],

    ['Atualização do AppImage Grab disponível', 'AppImage Grab update available', 'Actualización de AppImage Grab disponible'],
    ['Novo commit do AppImage Grab disponível', 'New AppImage Grab commit available', 'Nuevo commit de AppImage Grab disponible'],
    ['Um novo commit do AppImage Grab está disponível', 'A new AppImage Grab commit is available', 'Hay un nuevo commit de AppImage Grab disponible'],
    ['Recarregue a extensão do navegador', 'Reload your browser extension', 'Vuelve a cargar la extensión del navegador'],
    ['Recarregue a extensão', 'Reload the browser extension', 'Vuelve a cargar la extensión del navegador'],
    ['Copiar comando de atualização', 'Copy update command', 'Copiar comando de actualización'],
    ['Verificar novamente', 'Check again', 'Comprobar de nuevo'],
    ['Copiado!', 'Copied!', '¡Copiado!'],
    ['desconhecido', 'unknown', 'desconocido'],
    ['Copie este comando no terminal Linux:', 'Copy this command into your Linux terminal:', 'Copia este comando en tu terminal Linux:'],
    ['Copie e execute no terminal:', 'Copy and run in your terminal:', 'Copia y ejecuta en tu terminal:'],
    ['Recarregue a extensão depois de executar o instalador.', 'Reload the extension after running the installer.', 'Recarga la extensión después de ejecutar el instalador.'],
    ['Execute o instalador novamente e recarregue a extensão se ela foi instalada sem empacotamento.',
      'Re-run the installer, then reload the extension if it was loaded unpacked.',
      'Vuelve a ejecutar el instalador y luego recarga la extensión si se cargó sin empaquetar.'],
    ['Extensão:', 'Extension:', 'Extensión:'],
    ['Ponte nativa:', 'Native bridge:', 'Puente nativo:'],
    ['Ponte Python:', 'Python bridge:', 'Puente Python:'],
    ['Último commit na main:', 'Latest main:', 'Último commit de main:'],
    ['Extensão: {{extension}} · Ponte nativa: {{native}} · Último commit na main: {{latest}}',
      'Extension: {{extension}} · Native bridge: {{native}} · Latest main: {{latest}}',
      'Extensión: {{extension}} · Puente nativo: {{native}} · Último commit de main: {{latest}}'],
    ['Último commit na main: {{latest}} • Extensão: {{extension}} • Ponte Python: {{python}}. Execute o instalador novamente e recarregue a extensão se ela foi instalada sem empacotamento.',
      'Latest main: {{latest}} • Extension: {{extension}} • Python bridge: {{python}}. Re-run the installer, then reload the extension if it was loaded unpacked.',
      'Último commit de main: {{latest}} • Extensión: {{extension}} • Puente Python: {{python}}. Vuelve a ejecutar el instalador y luego recarga la extensión si se cargó sin empaquetar.'],
    ['Extensão: {{extension}} · Ponte nativa: {{native}} · Último commit na main: {{latest}}\nRecarregue a extensão depois de executar o instalador.',
      'Extension: {{extension}} · Native bridge: {{native}} · Latest main: {{latest}}\nReload the extension after running the installer.',
      'Extensión: {{extension}} · Puente nativo: {{native}} · Último commit de main: {{latest}}\nRecarga la extensión después de ejecutar el instalador.']
  ];

  const exact = new Map();
  const patterns = [];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [pt, en, es] of phrases) {
    const entries = [[pt, en, es]];
    if (pt !== en) entries.push([en, en, es]);
    for (const [source, english, spanish] of entries) {
      if (!source.includes('{{')) {
        exact.set(source, {pt_BR: pt, en: english, es: spanish || english});
        continue;
      }
      const variables = [];
      let regexp = '';
      let last = 0;
      for (const match of source.matchAll(/\{\{(\w+)\}\}/g)) {
        regexp += escape(source.slice(last, match.index)) + '([\\s\\S]*?)';
        variables.push(match[1]);
        last = match.index + match[0].length;
      }
      regexp += escape(source.slice(last));
      patterns.push({regex: new RegExp('^' + regexp + '$'), variables,
        fixedLength: source.replace(/\{\{\w+\}\}/g, '').length,
        outputs: {pt_BR: pt, en: english, es: spanish || english}});
    }
  }
  patterns.sort((a, b) => b.fixedLength - a.fixedLength);

  function translate(input) {
    if (typeof input !== 'string' || !input) return input;
    const start = /^\s*/.exec(input)[0];
    const end = /\s*$/.exec(input)[0];
    const source = input.slice(start.length, input.length - end.length);
    if (!source) return input;
    const simple = exact.get(source);
    if (simple) return start + simple[language] + end;
    // A combined status is made of separately translatable pieces; matching a
    // generic "{{version}}" pattern first could swallow the rest of the row.
    if (source.includes(' • ')) {
      const parts = source.split(' • ');
      const output = parts.map(part => translate(part));
      if (output.every((part, i) => part !== parts[i])) return start + output.join(' • ') + end;
    }
    for (const pattern of patterns) {
      const match = pattern.regex.exec(source);
      if (!match) continue;
      const values = Object.fromEntries(pattern.variables.map((name, index) => [name, match[index + 1]]));
      const translated = pattern.outputs[language].replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '');
      return start + translated + end;
    }
    // Some status texts combine independently translated fragments.
    if (source.includes(' • ')) {
      const parts = source.split(' • ');
      const output = parts.map(part => translate(part));
      if (output.some((part, i) => part !== parts[i])) return start + output.join(' • ') + end;
    }
    const colon = source.lastIndexOf(': ');
    if (colon >= 0) {
      const suffix = source.slice(colon + 2);
      const next = translate(suffix);
      if (next !== suffix) return start + source.slice(0, colon + 2) + next + end;
    }
    return input;
  }

  function localizeNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      const next = translate(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.nodeType === 1) {
      if (['SCRIPT', 'STYLE', 'CODE', 'TEXTAREA'].includes(node.tagName)) return;
      for (const attr of ['title', 'placeholder', 'aria-label', 'alt']) {
        if (!node.hasAttribute?.(attr)) continue;
        const before = node.getAttribute(attr);
        const after = translate(before);
        if (before !== after) node.setAttribute(attr, after);
      }
    }
    for (const child of node.childNodes || []) localizeNode(child);
  }

  function start() {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    localizeNode(document);
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'characterData') localizeNode(change.target);
        else if (change.type === 'attributes') localizeNode(change.target);
        else for (const node of change.addedNodes) localizeNode(node);
      }
    });
    observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label', 'alt']});
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
    else start();
  }
  return Object.freeze({language, locale, detect, translate,
    confirm: message => globalThis.confirm(translate(message)),
    prompt: (message, value) => globalThis.prompt(translate(message), value)});
})();
