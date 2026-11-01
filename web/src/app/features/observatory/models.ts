/** Lo que la página lee de las estadísticas públicas (stats/*.json). Ver docs/observatorio.md. */
export interface SalaryStat {
  n: number;
  medianUsd: number | null;
  p25Usd: number | null;
  p75Usd: number | null;
  suppressed: boolean;
}

export interface SkillShare {
  id: string;
  name: string;
  count: number;
  share: number | null;
}

export interface Summary {
  generatedAt: string;
  demo: boolean;
  license: string;
  methodology: string[];
  population: { open: number; ecuador: number; remote: number; freelance: number };
  remote: { share: number | null; jobs: number; scopes: Record<string, number> };
  topSkills: (SkillShare & { category: string | null; trendDeltaPp: number | null })[];
  topCompanies: { name: string; count: number; share: number | null }[];
  cities: {
    city: string;
    open: number;
    share: number | null;
    modality: Record<'onsite' | 'hybrid' | 'remote' | 'unknown', number>;
    topSkills: SkillShare[];
    topCompanies: { name: string; count: number }[];
    withSalaryShare: number | null;
    salary: SalaryStat;
  }[];
  salaries: {
    minSample: number;
    withSalaryShare: number | null;
    withoutSalaryShare: number | null;
    markets: {
      market: string;
      label: string;
      jobs: number;
      withSalary: number;
      withSalaryShare: number | null;
      overall: SalaryStat;
      byRole: (SalaryStat & { role: string; label: string })[];
      bySeniority: (SalaryStat & { seniority: string; label: string })[];
    }[];
  };
  trend: {
    status: 'ok' | 'insufficient-history';
    windowDays: number;
    observedDays: number;
    weekStarts: string[];
    weeklyTotals: number[];
    rising: { id: string; name: string; deltaPp: number; firstHalfShare: number | null; secondHalfShare: number | null }[];
    falling: { id: string; name: string; deltaPp: number; firstHalfShare: number | null; secondHalfShare: number | null }[];
  };
  latestMonth: string | null;
  sources: { name: string; openJobs: number; lastFetchedAt: string }[];
}

export interface MonthlyFile {
  months: { month: string; newJobs: number; remote: number; withSalary: number; frozen: boolean }[];
}

export interface ReportIndex {
  reports: { month: string; label: string; complete: boolean; newJobs: number }[];
}

export interface Report {
  month: string;
  label: string;
  complete: boolean;
  generatedAt: string;
  demo: boolean;
  license: string;
  newJobs: number;
  previous: { month: string; label: string; newJobs: number } | null;
  changePct: number | null;
  remoteShare: number | null;
  ecuadorShare: number | null;
  withSalaryShare: number | null;
  highlights: string[];
  topSkills: (SkillShare & { previousShare: number | null; deltaPp: number | null })[];
  cities: { city: string; newJobs: number; previous: number | null }[];
  topCompanies: { name: string; count: number }[];
  salary: (SalaryStat & { market: string; label: string })[];
  sources: { name: string; count: number }[];
  methodology: string[];
}

export const STATS = 'data/v1/stats/';
