/**
 * Creet - Keyword Matcher Module
 * Maps user request keywords to recommended skills (8 languages).
 */

/**
 * Default keyword-to-skill mapping.
 * Each entry: { keywords: string[], skill: string, domain: string }
 * Keywords include 8 languages: EN, KO, JA, ZH, ES, FR, DE, IT
 */
const DEFAULT_KEYWORD_MAP = [
  // Git / Version Control
  {
    skill: 'commit',
    domain: 'Git',
    keywords: [
      'commit', 'git commit', 'save changes',
      '커밋', '커밋해', '저장',
      'コミット', '保存',
      '提交', '保存更改',
      'confirmar', 'guardar cambios',
      'valider', 'sauvegarder',
      'committen', 'speichern',
      'committare', 'salvare',
    ],
  },
  {
    skill: 'commit-push-pr',
    domain: 'Git',
    keywords: [
      'push', 'pull request', 'pr', 'merge',
      '푸시', 'PR', '풀리퀘', '머지',
      'プッシュ', 'プルリクエスト', 'マージ',
      '推送', '合并请求', '合并',
      'empujar', 'solicitud de extracción', 'fusionar',
      'pousser', 'demande de fusion', 'fusionner',
      'pushen', 'zusammenführen',
      'spingere', 'richiesta di pull', 'unire',
    ],
  },

  // Code Quality
  {
    skill: 'code-review',
    domain: 'Quality',
    keywords: [
      'review', 'code review', 'check code', 'review pr',
      '리뷰', '코드 리뷰', '코드 검토', 'PR 리뷰',
      'レビュー', 'コードレビュー', 'コード確認',
      '审查', '代码审查', '代码检查',
      'revisión', 'revisión de código', 'revisar código',
      'revue', 'revue de code', 'vérifier le code',
      'Überprüfung', 'Code-Review', 'Code prüfen',
      'revisione', 'revisione del codice', 'controllare il codice',
    ],
  },

  // Frontend
  {
    skill: 'frontend-design',
    domain: 'Frontend',
    keywords: [
      'ui', 'design', 'frontend', 'page', 'component', 'layout', 'dashboard',
      'build page', 'create page', 'make page',
      'UI', '디자인', '프론트엔드', '페이지', '컴포넌트', '레이아웃', '대시보드',
      'ページ', 'コンポーネント', 'レイアウト', 'ダッシュボード',
      '页面', '组件', '布局', '仪表板',
      'página', 'componente', 'diseño',
      'page', 'composant', 'mise en page',
      'Seite', 'Komponente',
      'pagina', 'componente',
    ],
  },

  // Backend / Auth
  {
    skill: 'bkend-auth',
    domain: 'Backend',
    keywords: [
      'login', 'signup', 'auth', 'authentication', 'social login', 'oauth',
      '로그인', '회원가입', '인증', '소셜 로그인',
      'ログイン', 'サインアップ', '認証', 'ソーシャルログイン',
      '登录', '注册', '认证', '社交登录',
      'iniciar sesión', 'registrarse', 'autenticación',
      'connexion', 'inscription', 'authentification',
      'Anmeldung', 'Registrierung', 'Authentifizierung',
      'accesso', 'registrazione', 'autenticazione',
    ],
  },
  {
    skill: 'bkend-data',
    domain: 'Backend',
    keywords: [
      'database', 'db', 'table', 'crud', 'query', 'data model',
      '데이터베이스', 'DB', '테이블', '쿼리', '데이터 모델',
      'データベース', 'テーブル', 'クエリ',
      '数据库', '表', '查询', '数据模型',
      'base de datos', 'tabla', 'consulta',
      'base de données', 'table', 'requête',
      'Datenbank', 'Tabelle', 'Abfrage',
      'database', 'tabella', 'query',
    ],
  },

  // Monitoring
  {
    skill: 'seer',
    domain: 'Monitoring',
    keywords: [
      'sentry', 'error tracking', 'monitoring', 'error monitor',
      '센트리', '에러 추적', '모니터링',
      'エラー追跡', 'モニタリング',
      '错误追踪', '监控',
      'seguimiento de errores', 'monitoreo',
      'suivi des erreurs', 'surveillance',
      'Fehlerverfolgung', 'Überwachung',
      'tracciamento errori', 'monitoraggio',
    ],
  },

  // Deployment
  {
    skill: 'phase-9-deployment',
    domain: 'DevOps',
    keywords: [
      'deploy', 'deployment', 'production', 'release', 'ci/cd', 'publish',
      '배포', '프로덕션', '릴리스', '출시',
      'デプロイ', '本番', 'リリース', '公開',
      '部署', '生产', '发布',
      'desplegar', 'producción', 'lanzamiento',
      'déployer', 'production', 'publication',
      'bereitstellen', 'Produktion', 'Veröffentlichung',
      'distribuire', 'produzione', 'rilascio',
    ],
  },

  // Mobile
  {
    skill: 'mobile-app',
    domain: 'Mobile',
    keywords: [
      'mobile', 'app', 'react native', 'flutter', 'expo', 'ios', 'android',
      '모바일', '앱', '리액트 네이티브',
      'モバイル', 'アプリ',
      '移动', '应用',
      'móvil', 'aplicación',
      'mobile', 'application',
      'Mobil', 'App',
      'mobile', 'applicazione',
    ],
  },

  // Learning
  {
    skill: 'first-claude-code',
    domain: 'Learning',
    keywords: [
      'first project', 'beginner', 'start', 'new to', "don't know", 'help me start',
      'where to begin', 'how to start',
      '처음', '초보', '시작', '입문', '모르겠', '어디서부터',
      '初めて', '初心者', '始め方', 'わからない',
      '第一次', '初学者', '开始', '不知道',
      'principiante', 'empezar', 'no sé',
      'débutant', 'commencer', 'je ne sais pas',
      'Anfänger', 'anfangen', 'weiß nicht',
      'principiante', 'iniziare', 'non so',
    ],
  },
  {
    skill: 'learn-claude-code',
    domain: 'Learning',
    keywords: [
      'learn', 'tutorial', 'guide', 'teach', 'how to use', 'learning',
      '배우기', '학습', '가이드', '사용법', '배워',
      '学ぶ', 'チュートリアル', 'ガイド', '使い方',
      '学习', '教程', '指南', '怎么用',
      'aprender', 'tutorial', 'guía', 'cómo usar',
      'apprendre', 'tutoriel', 'guide', 'comment utiliser',
      'lernen', 'Anleitung', 'wie benutzt man',
      'imparare', 'tutorial', 'guida', 'come usare',
    ],
  },
];

/**
 * Match user message against keyword map.
 * @param {string} message - User's message
 * @param {Array} customMap - Optional custom keyword map (merged with default)
 * @returns {Array<{skill: string, domain: string, score: number}>}
 */
function matchKeywords(message, customMap) {
  const keywordMap = customMap
    ? [...DEFAULT_KEYWORD_MAP, ...customMap]
    : DEFAULT_KEYWORD_MAP;

  const lowerMsg = message.toLowerCase();
  const results = [];

  for (const entry of keywordMap) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (lowerMsg.includes(keyword.toLowerCase())) {
        // Longer keyword matches get higher scores
        score += keyword.length;
      }
    }
    if (score > 0) {
      results.push({
        skill: entry.skill,
        domain: entry.domain,
        score,
      });
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Format keyword map as markdown table for session context.
 */
function formatKeywordTable() {
  let table = '| Domain | Skill | Sample Keywords (EN/KO) |\n';
  table += '|--------|-------|--------------------------|\n';

  for (const entry of DEFAULT_KEYWORD_MAP) {
    const enKeywords = entry.keywords.filter(k => /^[a-zA-Z\s/'-]+$/.test(k)).slice(0, 3);
    const koKeywords = entry.keywords.filter(k => /[\uac00-\ud7af]/.test(k)).slice(0, 2);
    const samples = [...enKeywords, ...koKeywords].join(', ');
    table += `| ${entry.domain} | /${entry.skill} | ${samples} |\n`;
  }

  return table;
}

module.exports = { matchKeywords, formatKeywordTable, DEFAULT_KEYWORD_MAP };
