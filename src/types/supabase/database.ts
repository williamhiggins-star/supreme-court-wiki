export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      affiliations: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          org_id: string
          person_id: string
          role: string | null
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          org_id: string
          person_id: string
          role?: string | null
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          org_id?: string
          person_id?: string
          role?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      amicus_briefs: {
        Row: {
          brief_url: string | null
          case_id: string
          created_at: string
          filed_date: string | null
          filer_org_id: string | null
          id: string
          side: string
          summary: string | null
        }
        Insert: {
          brief_url?: string | null
          case_id: string
          created_at?: string
          filed_date?: string | null
          filer_org_id?: string | null
          id?: string
          side: string
          summary?: string | null
        }
        Update: {
          brief_url?: string | null
          case_id?: string
          created_at?: string
          filed_date?: string | null
          filer_org_id?: string | null
          id?: string
          side?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "amicus_briefs_filer_org_id_fkey"
            columns: ["filer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      amicus_counsel: {
        Row: {
          brief_id: string
          person_id: string
        }
        Insert: {
          brief_id: string
          person_id: string
        }
        Update: {
          brief_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amicus_counsel_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "amicus_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amicus_counsel_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amicus_counsel_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      appellate_impacts: {
        Row: {
          case_id: string
          created_at: string
          direction: string
          id: string
          impact_area: string
          writeup: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          direction: string
          id?: string
          impact_area: string
          writeup?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          direction?: string
          id?: string
          impact_area?: string
          writeup?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "appellate_impacts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      case_lower_courts: {
        Row: {
          case_id: string
          court_id: string
          created_at: string
          docket_number: string | null
          id: string
        }
        Insert: {
          case_id: string
          court_id: string
          created_at?: string
          docket_number?: string | null
          id?: string
        }
        Update: {
          case_id?: string
          court_id?: string
          created_at?: string
          docket_number?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_lower_courts_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_lower_courts_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard"
            referencedColumns: ["court_id"]
          },
          {
            foreignKeyName: "case_lower_courts_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["court_id"]
          },
        ]
      }
      case_participations: {
        Row: {
          case_id: string
          created_at: string
          id: string
          party_name: string | null
          person_id: string
          role: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          party_name?: string | null
          person_id: string
          role: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          party_name?: string | null
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_participations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      case_podcast_episodes: {
        Row: {
          case_id: string
          created_at: string
          episode_id: string
          episode_url: string
          match_confidence: number
          match_method: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          episode_id: string
          episode_url: string
          match_confidence: number
          match_method: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          episode_id?: string
          episode_url?: string
          match_confidence?: number
          match_method?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_podcast_episodes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      case_terms: {
        Row: {
          case_id: string
          term_id: string
        }
        Insert: {
          case_id: string
          term_id: string
        }
        Update: {
          case_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "case_terms_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "legal_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          argued_date: string | null
          background: string | null
          caption: string
          court_id: string
          created_at: string
          decided_date: string | null
          disposition: string | null
          docket_number: string | null
          id: string
          is_stub: boolean
          petitioner_argument: string | null
          petitioner_name: string | null
          petitioner_supporting_points: Json
          question_presented: string | null
          respondent_argument: string | null
          respondent_name: string | null
          respondent_supporting_points: Json
          significance: string | null
          sitting: string | null
          slug: string
          source_urls: Json
          status: string
          term: string | null
          updated_at: string
          vote_line: string | null
        }
        Insert: {
          argued_date?: string | null
          background?: string | null
          caption: string
          court_id: string
          created_at?: string
          decided_date?: string | null
          disposition?: string | null
          docket_number?: string | null
          id?: string
          is_stub?: boolean
          petitioner_argument?: string | null
          petitioner_name?: string | null
          petitioner_supporting_points?: Json
          question_presented?: string | null
          respondent_argument?: string | null
          respondent_name?: string | null
          respondent_supporting_points?: Json
          significance?: string | null
          sitting?: string | null
          slug: string
          source_urls?: Json
          status: string
          term?: string | null
          updated_at?: string
          vote_line?: string | null
        }
        Update: {
          argued_date?: string | null
          background?: string | null
          caption?: string
          court_id?: string
          created_at?: string
          decided_date?: string | null
          disposition?: string | null
          docket_number?: string | null
          id?: string
          is_stub?: boolean
          petitioner_argument?: string | null
          petitioner_name?: string | null
          petitioner_supporting_points?: Json
          question_presented?: string | null
          respondent_argument?: string | null
          respondent_name?: string | null
          respondent_supporting_points?: Json
          significance?: string | null
          sitting?: string | null
          slug?: string
          source_urls?: Json
          status?: string
          term?: string | null
          updated_at?: string
          vote_line?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard"
            referencedColumns: ["court_id"]
          },
          {
            foreignKeyName: "cases_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["court_id"]
          },
        ]
      }
      circuit_splits: {
        Row: {
          created_at: string
          id: string
          question: string
          scotus_case_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          question: string
          scotus_case_id?: string | null
          slug: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          question?: string
          scotus_case_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "circuit_splits_scotus_case_id_fkey"
            columns: ["scotus_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      citations: {
        Row: {
          cited_case_id: string
          citing_case_id: string
          context: string | null
          created_at: string
          treatment: string
        }
        Insert: {
          cited_case_id: string
          citing_case_id: string
          context?: string | null
          created_at?: string
          treatment: string
        }
        Update: {
          cited_case_id?: string
          citing_case_id?: string
          context?: string | null
          created_at?: string
          treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_cited_case_id_fkey"
            columns: ["cited_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      courts: {
        Row: {
          circuit_ordinal: number | null
          created_at: string
          id: string
          level: string
          name: string
          slug: string
          state: string | null
          updated_at: string
        }
        Insert: {
          circuit_ordinal?: number | null
          created_at?: string
          id?: string
          level: string
          name: string
          slug: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          circuit_ordinal?: number | null
          created_at?: string
          id?: string
          level?: string
          name?: string
          slug?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      decision_ties: {
        Row: {
          case_id: string
          created_at: string
          id: string
          join_scope: string
          join_scope_detail: string | null
          opinion_id: string
          person_id: string
          role: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          join_scope?: string
          join_scope_detail?: string | null
          opinion_id: string
          person_id: string
          role: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          join_scope?: string
          join_scope_detail?: string | null
          opinion_id?: string
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decision_ties_opinion_id_fkey"
            columns: ["opinion_id"]
            isOneToOne: false
            referencedRelation: "opinions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ties_opinion_id_fkey"
            columns: ["opinion_id"]
            isOneToOne: false
            referencedRelation: "term_stats_opinion_word_count_extremes"
            referencedColumns: ["opinion_id"]
          },
          {
            foreignKeyName: "decision_ties_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_ties_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      decisions: {
        Row: {
          case_id: string
          created_at: string
          person_id: string
          position: string
          primary_tie_id: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          person_id: string
          position: string
          primary_tie_id?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          person_id?: string
          position?: string
          primary_tie_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "decisions_primary_tie_id_fkey"
            columns: ["primary_tie_id"]
            isOneToOne: false
            referencedRelation: "decision_ties"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_events: {
        Row: {
          action: string
          created_at: string
          detail: Json
          dossier_id: string
          id: string
          triggered_by_case_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          dossier_id: string
          id?: string
          triggered_by_case_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          dossier_id?: string
          id?: string
          triggered_by_case_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "dossier_events_triggered_by_case_id_fkey"
            columns: ["triggered_by_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      dossiers: {
        Row: {
          analytical_positions: Json
          case_count: number
          created_at: string
          established_facts: Json
          id: string
          kind: string
          open_threads: Json
          prior_positions: Json
          semantic_summary: string | null
          subject_court_id: string | null
          subject_person_id: string | null
          subject_slug: string | null
          updated_at: string
        }
        Insert: {
          analytical_positions?: Json
          case_count?: number
          created_at?: string
          established_facts?: Json
          id?: string
          kind: string
          open_threads?: Json
          prior_positions?: Json
          semantic_summary?: string | null
          subject_court_id?: string | null
          subject_person_id?: string | null
          subject_slug?: string | null
          updated_at?: string
        }
        Update: {
          analytical_positions?: Json
          case_count?: number
          created_at?: string
          established_facts?: Json
          id?: string
          kind?: string
          open_threads?: Json
          prior_positions?: Json
          semantic_summary?: string | null
          subject_court_id?: string | null
          subject_person_id?: string | null
          subject_slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_subject_court_id_fkey"
            columns: ["subject_court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_subject_court_id_fkey"
            columns: ["subject_court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard"
            referencedColumns: ["court_id"]
          },
          {
            foreignKeyName: "dossiers_subject_court_id_fkey"
            columns: ["subject_court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["court_id"]
          },
          {
            foreignKeyName: "dossiers_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          finished_at: string | null
          id: string
          started_at: string
          stats: Json
          status: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Relationships: []
      }
      judgeships: {
        Row: {
          appointed_by: string | null
          court_id: string
          created_at: string
          end_date: string | null
          id: string
          is_chief: boolean
          person_id: string
          start_date: string | null
          title: string
        }
        Insert: {
          appointed_by?: string | null
          court_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_chief?: boolean
          person_id: string
          start_date?: string | null
          title: string
        }
        Update: {
          appointed_by?: string | null
          court_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_chief?: boolean
          person_id?: string
          start_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "judgeships_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgeships_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard"
            referencedColumns: ["court_id"]
          },
          {
            foreignKeyName: "judgeships_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["court_id"]
          },
          {
            foreignKeyName: "judgeships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgeships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      justice_stats: {
        Row: {
          cases_participated: number
          concurrences: number
          dissents: number
          estimated_minutes: number
          id: string
          majority_opinions: number
          person_id: string
          questions: number
          term: string
          total_words: number
          updated_at: string
        }
        Insert: {
          cases_participated?: number
          concurrences?: number
          dissents?: number
          estimated_minutes?: number
          id?: string
          majority_opinions?: number
          person_id: string
          questions?: number
          term: string
          total_words?: number
          updated_at?: string
        }
        Update: {
          cases_participated?: number
          concurrences?: number
          dissents?: number
          estimated_minutes?: number
          id?: string
          majority_opinions?: number
          person_id?: string
          questions?: number
          term?: string
          total_words?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "justice_stats_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justice_stats_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      justice_term_blocs: {
        Row: {
          bloc: string
          created_at: string
          id: string
          person_id: string
          term: string
          updated_at: string
        }
        Insert: {
          bloc: string
          created_at?: string
          id?: string
          person_id: string
          term: string
          updated_at?: string
        }
        Update: {
          bloc?: string
          created_at?: string
          id?: string
          person_id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "justice_term_blocs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "justice_term_blocs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      key_exchanges: {
        Row: {
          advocate_id: string | null
          case_id: string
          context: string | null
          created_at: string
          exchange: string
          id: string
          justice_id: string | null
          role: string | null
          significance: string | null
        }
        Insert: {
          advocate_id?: string | null
          case_id: string
          context?: string | null
          created_at?: string
          exchange: string
          id?: string
          justice_id?: string | null
          role?: string | null
          significance?: string | null
        }
        Update: {
          advocate_id?: string | null
          case_id?: string
          context?: string | null
          created_at?: string
          exchange?: string
          id?: string
          justice_id?: string | null
          role?: string | null
          significance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_exchanges_advocate_id_fkey"
            columns: ["advocate_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_exchanges_advocate_id_fkey"
            columns: ["advocate_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "key_exchanges_justice_id_fkey"
            columns: ["justice_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_exchanges_justice_id_fkey"
            columns: ["justice_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      lawyer_stats: {
        Row: {
          cases_argued: number
          estimated_minutes: number
          id: string
          label: string
          losses: number
          name: string
          person_id: string | null
          term: string
          total_words: number
          updated_at: string
          wins: number
        }
        Insert: {
          cases_argued?: number
          estimated_minutes?: number
          id?: string
          label: string
          losses?: number
          name: string
          person_id?: string | null
          term: string
          total_words?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          cases_argued?: number
          estimated_minutes?: number
          id?: string
          label?: string
          losses?: number
          name?: string
          person_id?: string | null
          term?: string
          total_words?: number
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "lawyer_stats_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lawyer_stats_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      legal_terms: {
        Row: {
          created_at: string
          definition: string
          id: string
          slug: string
          term: string
        }
        Insert: {
          created_at?: string
          definition: string
          id?: string
          slug: string
          term: string
        }
        Update: {
          created_at?: string
          definition?: string
          id?: string
          slug?: string
          term?: string
        }
        Relationships: []
      }
      opinion_joins: {
        Row: {
          opinion_id: string
          person_id: string
        }
        Insert: {
          opinion_id: string
          person_id: string
        }
        Update: {
          opinion_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opinion_joins_opinion_id_fkey"
            columns: ["opinion_id"]
            isOneToOne: false
            referencedRelation: "opinions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinion_joins_opinion_id_fkey"
            columns: ["opinion_id"]
            isOneToOne: false
            referencedRelation: "term_stats_opinion_word_count_extremes"
            referencedColumns: ["opinion_id"]
          },
          {
            foreignKeyName: "opinion_joins_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinion_joins_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      opinions: {
        Row: {
          author_id: string | null
          case_id: string
          created_at: string
          full_text: string | null
          full_text_url: string | null
          id: string
          kind: string
          summary: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          author_id?: string | null
          case_id: string
          created_at?: string
          full_text?: string | null
          full_text_url?: string | null
          id?: string
          kind: string
          summary?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          author_id?: string | null
          case_id?: string
          created_at?: string
          full_text?: string | null
          full_text_url?: string | null
          id?: string
          kind?: string
          summary?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "opinions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      oral_argument_transcripts: {
        Row: {
          argued_date: string | null
          case_id: string
          created_at: string
          id: string
          source_url: string
          transcript_text: string
          updated_at: string
        }
        Insert: {
          argued_date?: string | null
          case_id: string
          created_at?: string
          id?: string
          source_url: string
          transcript_text: string
          updated_at?: string
        }
        Update: {
          argued_date?: string | null
          case_id?: string
          created_at?: string
          id?: string
          source_url?: string
          transcript_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "oral_argument_transcripts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pattern_breaks: {
        Row: {
          case_id: string
          created_at: string
          description: string
          dossier_id: string
          id: string
          significance: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          description: string
          dossier_id: string
          id?: string
          significance?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string
          dossier_id?: string
          id?: string
          significance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "pattern_breaks_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          bio_summary: string | null
          born: string | null
          created_at: string
          died: string | null
          full_name: string
          id: string
          short_name: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          bio_summary?: string | null
          born?: string | null
          created_at?: string
          died?: string | null
          full_name: string
          id?: string
          short_name?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          bio_summary?: string | null
          born?: string | null
          created_at?: string
          died?: string | null
          full_name?: string
          id?: string
          short_name?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      publication_cases: {
        Row: {
          case_id: string
          publication_id: string
          relevance: string | null
        }
        Insert: {
          case_id: string
          publication_id: string
          relevance?: string | null
        }
        Update: {
          case_id?: string
          publication_id?: string
          relevance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "publication_cases_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_people: {
        Row: {
          person_id: string
          publication_id: string
        }
        Insert: {
          person_id: string
          publication_id: string
        }
        Update: {
          person_id?: string
          publication_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publication_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "publication_people_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "publications"
            referencedColumns: ["id"]
          },
        ]
      }
      publications: {
        Row: {
          author_text: string | null
          created_at: string
          id: string
          kind: string
          published_at: string | null
          source_org_id: string | null
          summary: string | null
          title: string
          url: string
        }
        Insert: {
          author_text?: string | null
          created_at?: string
          id?: string
          kind: string
          published_at?: string | null
          source_org_id?: string | null
          summary?: string | null
          title: string
          url: string
        }
        Update: {
          author_text?: string | null
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          source_org_id?: string | null
          summary?: string | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      revisions: {
        Row: {
          created_at: string
          id: string
          row_id: string
          run_id: string | null
          snapshot: Json
          table_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          row_id: string
          run_id?: string | null
          snapshot: Json
          table_name: string
        }
        Update: {
          created_at?: string
          id?: string
          row_id?: string
          run_id?: string | null
          snapshot?: Json
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      split_positions: {
        Row: {
          case_id: string
          created_at: string
          id: string
          position: string
          split_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          position: string
          split_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          position?: string
          split_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "split_positions_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "circuit_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      statute_citations: {
        Row: {
          citing_case_id: string
          context: string | null
          created_at: string
          statute_id: string
        }
        Insert: {
          citing_case_id: string
          context?: string | null
          created_at?: string
          statute_id: string
        }
        Update: {
          citing_case_id?: string
          context?: string | null
          created_at?: string
          statute_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_citing_case_id_fkey"
            columns: ["citing_case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "statute_citations_statute_id_fkey"
            columns: ["statute_id"]
            isOneToOne: false
            referencedRelation: "statutes"
            referencedColumns: ["id"]
          },
        ]
      }
      statutes: {
        Row: {
          citation: string
          created_at: string
          id: string
          jurisdiction: string | null
          name: string
          slug: string
          updated_at: string
          url: string | null
        }
        Insert: {
          citation: string
          created_at?: string
          id?: string
          jurisdiction?: string | null
          name: string
          slug: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          citation?: string
          created_at?: string
          id?: string
          jurisdiction?: string | null
          name?: string
          slug?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      votes: {
        Row: {
          case_id: string
          person_id: string
          side: string
        }
        Insert: {
          case_id: string
          person_id: string
          side: string
        }
        Update: {
          case_id?: string
          person_id?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "votes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
    }
    Views: {
      term_stats_agreement: {
        Row: {
          agreement_pct: number | null
          agreement_pct_closely_divided: number | null
          cases_agreed: number | null
          cases_agreed_closely_divided: number | null
          cases_both_participated: number | null
          cases_both_participated_closely_divided: number | null
          person_id_1: string | null
          person_id_2: string | null
          term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id_1"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id_2"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id_1"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id_2"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_case_combined_word_counts: {
        Row: {
          caption: string | null
          case_id: string | null
          combined_word_count: number | null
          opinions_with_word_count: number | null
          slug: string | null
          term: string | null
          total_opinions: number | null
        }
        Relationships: []
      }
      term_stats_case_sides: {
        Row: {
          case_id: string | null
          person_id: string | null
          position: string | null
          side: string | null
        }
        Insert: {
          case_id?: string | null
          person_id?: string | null
          position?: string | null
          side?: never
        }
        Update: {
          case_id?: string | null
          person_id?: string | null
          position?: string | null
          side?: never
        }
        Relationships: [
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_case_splits: {
        Row: {
          caption: string | null
          case_id: string | null
          dissent_count: number | null
          is_closely_divided: boolean | null
          is_unanimous: boolean | null
          majority_count: number | null
          slug: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_circuit_scorecard: {
        Row: {
          affirmed: number | null
          affirmed_in_part: number | null
          cases_decided: number | null
          court_id: string | null
          court_name: string | null
          court_slug: string | null
          other_or_no_disposition: number | null
          reversed: number | null
          term: string | null
          vacated: number | null
        }
        Relationships: []
      }
      term_stats_circuit_scorecard_detail: {
        Row: {
          caption: string | null
          case_id: string | null
          case_lower_court_id: string | null
          case_slug: string | null
          court_id: string | null
          court_name: string | null
          court_slug: string | null
          disposition: string | null
          docket_number: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_closely_divided_cases: {
        Row: {
          caption: string | null
          case_id: string | null
          dissent_count: number | null
          dissenting_justices: Json | null
          majority_count: number | null
          slug: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_companion_cases: {
        Row: {
          case_id: string | null
          docket_number: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_days_to_decision: {
        Row: {
          argued_date: string | null
          caption: string | null
          case_id: string | null
          days_to_decision: number | null
          decided_date: string | null
          slug: string | null
          term: string | null
        }
        Insert: {
          argued_date?: string | null
          caption?: string | null
          case_id?: string | null
          days_to_decision?: never
          decided_date?: string | null
          slug?: string | null
          term?: string | null
        }
        Update: {
          argued_date?: string | null
          caption?: string | null
          case_id?: string | null
          days_to_decision?: never
          decided_date?: string | null
          slug?: string | null
          term?: string | null
        }
        Relationships: []
      }
      term_stats_days_to_decision_by_author: {
        Row: {
          avg_days_to_decision: number | null
          majority_opinions_authored: number | null
          max_days: number | null
          min_days: number | null
          person_id: string | null
          term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_ideological_split_rate: {
        Row: {
          decided_cases: number | null
          ideologically_split_cases: number | null
          ideologically_split_pct: number | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_ideological_splits: {
        Row: {
          case_id: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_majority_frequency: {
        Row: {
          cases_participated: number | null
          cases_participated_closely_divided: number | null
          cases_participated_non_unanimous: number | null
          majority_cases: number | null
          majority_pct: number | null
          majority_pct_closely_divided: number | null
          majority_pct_non_unanimous: number | null
          person_id: string | null
          term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_opinion_word_count_extremes: {
        Row: {
          author_name: string | null
          caption: string | null
          case_slug: string | null
          kind: string | null
          opinion_id: string | null
          person_id: string | null
          term: string | null
          word_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_opinions_authored: {
        Row: {
          kind: string | null
          opinion_count: number | null
          person_id: string | null
          term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_opinions_authored_summary: {
        Row: {
          concur_dissents: number | null
          concurrences: number | null
          dissents: number | null
          majority_opinions: number | null
          person_id: string | null
          plurality_opinions: number | null
          term: string | null
          total_opinions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_opinions_by_type: {
        Row: {
          kind: string | null
          opinion_count: number | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_sitting_index: {
        Row: {
          cases_count: number | null
          decided_count: number | null
          sitting: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_unanimity_rate: {
        Row: {
          decided_cases: number | null
          term: string | null
          unanimous_cases: number | null
          unanimous_pct: number | null
        }
        Relationships: []
      }
      term_stats_vote_side_cross_check: {
        Row: {
          case_id: string | null
          check_status: string | null
          derived_side: string | null
          person_id: string | null
          position: string | null
          stored_side: string | null
          term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_combined_word_counts"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_case_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_circuit_scorecard_detail"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_closely_divided_cases"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_days_to_decision"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_ideological_splits"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_vote_split_distribution: {
        Row: {
          case_count: number | null
          dissent_count: number | null
          ideologically_split_case_count: number | null
          majority_count: number | null
          split_label: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_voting_alignment_grid: {
        Row: {
          caption: string | null
          case_id: string | null
          full_name: string | null
          grid_cell: string | null
          justice_slug: string | null
          person_id: string | null
          position: string | null
          slug: string | null
          term: string | null
        }
        Relationships: []
      }
      term_stats_word_counts_by_author: {
        Row: {
          avg_word_count: number | null
          kind: string | null
          max_word_count: number | null
          min_word_count: number | null
          opinions_written: number | null
          person_id: string | null
          term: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opinions_author_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "term_stats_voting_alignment_grid"
            referencedColumns: ["person_id"]
          },
        ]
      }
      term_stats_word_counts_by_type_over_time: {
        Row: {
          avg_word_count: number | null
          kind: string | null
          opinions_written: number | null
          term: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
