export interface SemanticRelevance {
  score: number
  analysis: string
}

export interface CommercialValue {
  score: number
  analysis: string
}

export interface PerformanceAnalysis {
  costEfficiency: string
  clickQuality: string
}

export interface Recommendation {
  isNegative: boolean
  confidence: number
  negativeKeyword: string
  matchType: 'exact' | 'phrase' | 'broad'
  level: 'campaign' | 'account' | 'adgroup'
  reasoning: string
}

export interface Analysis {
  semanticRelevance: SemanticRelevance
  commercialValue: CommercialValue
  performanceAnalysis: PerformanceAnalysis
  recommendation: Recommendation
}

export interface AnalysisResult {
  id: string
  searchTerm: string
  keyword: string
  campaign: string
  adGroup: string
  impressions: number
  clicks: number
  cost: number
  conversions: number
  conversionValue: number
  analysis: Analysis
}