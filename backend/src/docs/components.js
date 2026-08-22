/**
 * 🔴 04_계약/*.envelope.json 을 OpenAPI components로 옮긴 것.
 *    계약 파일이 정본이고 여기는 사본이다 — 계약이 바뀌면 여기를 맞춘다.
 */
const Reason = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    page: { type: 'integer', description: '근거 쪽. 모르면 0 → 화면에 「쪽 미상」' },
    docId: { type: 'string', description: '어느 첨부에서 나왔나 (fileSeq)' },
    confidence: { type: 'string', enum: ['high', 'low', 'unknown'] },
  },
};

export const components = {
  schemas: {
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'E_CASE_NOT_FOUND' },
            message: { type: 'string', description: '🔴 사람이 읽는 완성문. 프론트는 이 문장을 그대로 렌더한다' },
          },
        },
      },
    },

    CompanyCardView: {
      type: 'object',
      required: ['companyId', 'name', 'stats', 'sections'],
      properties: {
        companyId: { type: 'string' },
        name: { type: 'string', example: '주식회사 다온피엠씨' },
        bizNo: { type: 'string', nullable: true },
        savedAt: { type: 'string' },
        stats: {
          type: 'array',
          description: '상단 지표 타일 4개',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'pmo' },
              label: { type: 'string', example: '공공 정보화 PMO 실적' },
              value: { type: 'string', nullable: true, example: '8건' },
              sub: { type: 'string', nullable: true, example: '최근 3년' },
              status: { type: 'string', enum: ['confirmed', 'unverified', 'missing'] },
            },
          },
        },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title', 'rows'],
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              column: { type: 'integer', description: '🔴 희망 열(0~2). 좁은 화면에서는 프론트가 접는다' },
              note: { type: 'string', description: '🔴 서버가 만든 문장. 프론트는 그대로 렌더한다' },
              chips: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', example: '공공 PMO 8' },
                    tone: { type: 'string', enum: ['success', 'danger', 'info', 'neutral'] },
                  },
                },
              },
              rows: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string', nullable: true },
                    source: { type: 'string', nullable: true, description: '근거 파일명' },
                    status: { type: 'string', enum: ['confirmed', 'unverified', 'missing'] },
                    action: { type: 'string', enum: ['manual'], description: '「직접 입력」 버튼을 붙인다' },
                  },
                },
              },
            },
          },
        },
        documents: { type: 'array', items: { type: 'object' } },
      },
    },

    DocUpload: {
      type: 'object',
      required: ['uploadId', 'filename', 'docType', 'extraction'],
      properties: {
        uploadId: { type: 'string', example: 'up_3f2a9c1b4d5e' },
        filename: { type: 'string', example: '사업자등록증.pdf' },
        bytes: { type: 'integer' },
        docType: {
          type: 'object',
          description: '🔴 규칙 분류 결과. key가 null이면 판정하지 않은 것이다',
          properties: {
            key: { type: 'string', enum: ['biz_reg', 'sme_cert', 'credit_rating', 'pia_designation', 'sw_business', 'performance', 'financial', 'tech_staff'] },
            label: { type: 'string', example: '사업자등록증' },
            confidence: { type: 'string', enum: ['high', 'low', 'unknown'] },
            score: { type: 'integer' },
            margin: { type: 'integer', description: '1등과 2등의 점수 차. 좁으면 판정하지 않는다' },
            matched: { type: 'array', items: { type: 'string' }, description: '걸린 표제·단서' },
            candidates: {
              type: 'array',
              items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, score: { type: 'integer' } } },
            },
          },
        },
        extraction: {
          type: 'object',
          properties: {
            data: { type: 'object', description: '에이전트가 뽑은 JSON 그대로', additionalProperties: true },
            raw: { type: 'string', description: 'JSON 파싱에 실패했을 때만. 원문을 버리지 않는다' },
            fields: {
              type: 'object',
              description: '🟢 필드별 confidence · 근거 쪽 · 좌표',
              additionalProperties: {
                type: 'object',
                properties: {
                  confidence: { type: 'string', enum: ['high', 'low', 'unknown'] },
                  page: { type: 'integer', description: '근거 쪽. 모르면 0' },
                  coordinates: { type: 'array', items: { type: 'object' } },
                },
              },
            },
            confidence: { type: 'string', enum: ['high', 'low', 'unknown'], description: '🔴 하나라도 low면 low' },
            confidenceCounts: {
              type: 'object',
              description: '배열 필드에는 confidence가 실려 오지 않아 unknown이 남는다. 그 수를 숨기지 않는다',
              properties: { high: { type: 'integer' }, low: { type: 'integer' }, unknown: { type: 'integer' } },
            },
            lowFields: { type: 'array', items: { type: 'string' }, description: '🔴 low인 필드 이름 — 화면이 ⚠를 여기에 단다' },
          },
        },
        meta: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['agent', 'fixture'] },
            cached: { type: 'boolean' },
            agentId: { type: 'string', example: 'agt_bzDccT6TnfW5hmiyTQBUoG' },
            configId: { type: 'string', nullable: true },
            jobId: { type: 'string', example: 'job_Hskfqw9nMbWRaKJ3FsJLq3' },
            fileId: { type: 'string' },
            stepModel: { type: 'string', example: 'step_2_extract' },
            agentCacheHit: { type: 'boolean' },
            pages: { type: 'integer' },
            textChars: { type: 'integer' },
            elapsedMs: { type: 'integer' },
          },
        },
      },
    },

    Factsheet: {
      type: 'object',
      required: ['caseId', 'status', 'verdict', 'tabs', 'downloads'],
      properties: {
        caseId: { type: 'string', example: 'R25BK00645031-000' },
        status: { type: 'string', enum: ['collecting', 'parsing', 'judging', 'done', 'failed'] },
        progress: {
          type: 'array',
          description: '화면②의 단계 표시. 순서가 의미다',
          items: {
            type: 'object',
            required: ['step', 'state'],
            properties: {
              step: { type: 'string', example: '첨부 5건 수집' },
              state: { type: 'string', enum: ['pending', 'running', 'done', 'failed'] },
              detail: { type: 'string' },
            },
          },
        },
        verdict: {
          type: 'object',
          required: ['badge'],
          properties: {
            badge: { type: 'string', enum: ['eligible'], description: '🔴 값이 하나다 — 제외된 건은 상세로 오지 않는다' },
            unverified: { type: 'integer', description: '🔴 못 읽어 판정 못 한 항목 수. 제외 사유가 아니다' },
            decision: { type: 'string', enum: ['pending', 'go', 'skip'], default: 'pending' },
            headline: { type: 'string' },
            reasons: { type: 'array', items: Reason },
          },
        },
        tabs: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'title', 'columns', 'rows'],
            properties: {
              id: { type: 'string', example: 'compliance' },
              kind: { type: 'string', enum: ['table', 'checklist'], default: 'table' },
              title: { type: 'string' },
              columns: { type: 'array', items: { type: 'string' } },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
              warnings: { type: 'array', items: { type: 'string' }, description: '🔴 Node가 다시 센 검산 결과. 표 위에 붉게' },
              summary: { type: 'string', example: '전체 151건 중 미대응 0건' },
            },
          },
        },
        downloads: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'label', 'url'],
            properties: {
              id: { type: 'string' },
              label: { type: 'string', example: 'WBS.xlsx' },
              url: { type: 'string' },
              bytes: { type: 'integer' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            cached: { type: 'boolean', description: '🔴 사전 실행 결과면 true. 화면 구석에 표시한다' },
            agentId: { type: 'string' },
            configVersion: { type: 'string' },
            elapsedMs: { type: 'integer' },
            attachments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fileSeq: { type: 'integer' },
                  filename: { type: 'string' },
                  docClass: { type: 'string' },
                  bytes: { type: 'integer' },
                },
              },
            },
          },
        },
        error: { $ref: '#/components/schemas/Error/properties/error' },
      },
    },

    Screening: {
      type: 'object',
      required: ['companyId', 'status', 'summary', 'shortlist'],
      properties: {
        companyId: { type: 'string', example: 'co_daon_demo' },
        status: { type: 'string', enum: ['scanning', 'screening', 'done', 'failed'] },
        summary: {
          type: 'object',
          description: '🔴 분모. 「N건을 훑어 M건」이 이 제품의 문장이다',
          required: ['scanned', 'excluded', 'shortlisted'],
          properties: {
            scanned: { type: 'integer' },
            excludedCheap: { type: 'integer', description: '메타데이터만으로 제외 (Parse 안 돌림)' },
            parsed: { type: 'integer', description: '첨부를 실제로 Parse한 수 — 비용이 여기서 난다' },
            excluded: { type: 'integer' },
            shortlisted: { type: 'integer' },
            window: { type: 'string', example: '2026-08-01 ~ 08-22 공고분' },
          },
        },
        shortlist: {
          type: 'array',
          items: {
            type: 'object',
            required: ['caseId', 'title', 'org', 'deadline'],
            properties: {
              caseId: { type: 'string' },
              title: { type: 'string' },
              org: { type: 'string' },
              budget: { type: 'string', description: '문자열 그대로 — 표기를 바꾸지 않는다' },
              deadline: { type: 'string' },
              daysLeft: { type: 'integer', description: '🔴 남은 영업일' },
              matched: { type: 'integer' },
              unverified: { type: 'integer' },
              reasons: { type: 'array', items: Reason },
              decision: { type: 'string', enum: ['pending', 'go', 'skip'], default: 'pending' },
              factsheetUrl: { type: 'string' },
            },
          },
        },
        excludedSamples: {
          type: 'array',
          description: '🔴 화면에는 접어 둔다. 「나머지는 왜 뺐냐」가 데모의 가장 강한 지점이다',
          items: {
            type: 'object',
            required: ['caseId', 'reason'],
            properties: {
              caseId: { type: 'string' },
              title: { type: 'string' },
              stage: { type: 'string', enum: ['cheap', 'parsed'] },
              reason: { type: 'string', example: '업종코드 6525 필요 — 회사 미보유' },
              page: { type: 'integer' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            cached: { type: 'boolean' },
            listSource: { type: 'string', enum: ['openapi', 'cached'] },
            elapsedMs: { type: 'integer' },
            costUsd: { type: 'number' },
          },
        },
        error: { $ref: '#/components/schemas/Error/properties/error' },
      },
    },
  },

  responses: {
    Error: {
      description: '오류 — error.message를 그대로 화면에 띄운다',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
  },
};
