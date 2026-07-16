---
name: ""
overview: ""
todos: []
isProject: false
---

# Writing Mode Prompt Optimization — Five-Agent Orchestration Plan                                    

                                                                                                        

  ## 1. Optimization Goal and Approach                                                                  

                                                                                                        

  Systematically optimize writing mode until every supported parameter produces consistently high-      

  quality, ready-to-use output. Testing will bypass the overlay and Studio entirely.                    

                                                                                                        

  Primary execution paths:                                                                              

                                                                                                        

  - Call optimizeStream() from a TypeScript test runner, which sends requests directly to OpenAI and    

    provides the fastest iteration path.                                                                

                                                                                                        

  - Validate release candidates through POST [http://127.0.0.1:5174/api/optimize](http://127.0.0.1:5174/api/optimize), exercising the         

    production request and cleanup path with skipCache: true.                                           

                                                                                                        

  - Record the exact request, generated system/user prompts, raw response, cleaned response, latency,   

    configuration, round, and code revision for every call.                                             

                                                                                                        

  Parameter coverage:                                                                                   

                                                                                                        

  - Active inputs: prompt, writingType, level, context, terminalContext, and every captureContext       

    field.                                                                                              

                                                                                                        

  - Context settings: screenContext, styleMatching, category presets, context caps, and absent-context  

    controls.                                                                                           

                                                                                                        

  - Compatibility inputs: model, persona, promptType, skipCache, and captureContext.suggestedModel.     

    These should be tested to confirm that fields intentionally ignored by writing-mode prompt          

    construction do not alter its contract.                                                             

                                                                                                        

  - Prompt parameters: deliverable definitions, type rules, all 16 type-by-level rule cells,            

    structure-only behavior, output rules, terminal precedence, destination-context rendering, and      

    category directives.                                                                                

                                                                                                        

  - Provider configuration: fixed gpt-4.1-mini baseline and temperature candidates 0, 0.1, 0.3, and     

    0.5. Configuration comparisons occur after rule tuning so effects are attributable.                 

                                                                                                        

  Use a versioned corpus divided into tuning and locked holdout sets. Include short and long drafts,    

  incomplete drafts, typo-heavy input, multiple facts, existing formatting, non-English text,           

  ambiguous tone, adversarial instructions, and sensitive or irrelevant surrounding context.            

                                                                                                        

  ## 2. Five-Agent Responsibilities                                                                     

                                                                                                        

  ### Agent 1 — Harness, Corpus, Parameter Inventory, and Provider Configuration                        

                                                                                                        

  - Create the canonical parameter manifest directly from OptimizeRequest, WritingParams,               

    CaptureContext, writing enums, and context caps.                                                    

                                                                                                        

  - Build scripts/writing-round.mts with filters for round, agent slice, corpus partition, repeat       

    count, context mode, and transport.                                                                 

                                                                                                        

  - Generate direct requests with skipCache: true; default to three repeats during tuning and five      

    during convergence validation.                                                                      

                                                                                                        

  - Maintain tuning and locked holdout corpora, with at least eight representative drafts per writing   

    type in each partition.                                                                             

                                                                                                        

  - Confirm compatibility behavior for every target model, persona, promptType, and suggestedModel      

    value by comparing constructed meta-prompts and running representative API smoke tests.

                                                                                                        

  - After prompt rules stabilize, run controlled temperature comparisons. Retain 0.3 unless another     

    candidate improves holdout quality and consistency without violating invariants.                    

                                                                                                        

  - Own rate limiting, retry handling, request identifiers, cost tracking, and immutable JSONL result   

    shards.                                                                                             

                                                                                                        

  ### Agent 2 — Email and Message Optimization                                                          

                                                                                                        

  Parameter ownership:                                                                                  

                                                                                                        

  - [DELIVERABLE.email](http://DELIVERABLE.email), DELIVERABLE.message                                                              

  - TYPE_[RULES.email](http://RULES.email), TYPE_RULES.message                                                                

  - All eight email/message LEVEL_RULES cells                                                           

  - Structure-only behavior for both types                                                              

                                                                                                        

  Tasks:                                                                                                

                                                                                                        

  - Test every email and message level against all assigned tuning drafts.                              

  - Validate email structure, conditional subject lines, greetings, sign-offs, factual preservation,    

    and Formal/Friendly/Informal distinctions.                                                          

                                                                                                        

  - Validate message brevity, absence of unintended email conventions, Informal/Formal distinctions,    

    and L4 Auto adaptation.                                                                             

                                                                                                        

  - Use paired cases that differ only in recipient or relationship cues to verify Auto tone decisions.  

  - Compare each proposed rule revision against the current rule using identical inputs and repeat      

    counts.                                                                                             

                                                                                                        

  - Retest affected cells plus a fixed regression sample before submitting a winning revision.          

                                                                                                        

  ### Agent 3 — Question, Explanation, and Terminal Override Optimization                               

                                                                                                        

  Parameter ownership:                                                                                  

                                                                                                        

  - DELIVERABLE.question, DELIVERABLE.explain                                                           

  - TYPE_RULES.question, TYPE_RULES.explain                                                             

  - All eight question/explanation LEVEL_RULES cells                                                    

  - terminalContext and terminal-rule precedence across all writing types                               

                                                                                                        

  Tasks:                                                                                                

                                                                                                        

  - Validate Structure, Closed, Open, and Auto question behavior, including punctuation,                

    answerability, and number of primary questions.                                                     

                                                                                                        

  - Validate Structure, Simple, Technical, and Step-by-step explanations for audience fit, factual      

    fidelity, clarity, and required numbering.                                                          

                                                                                                        

  - Test non-English language preservation across both types.                                           

  - Exercise terminalContext: true across all four writing types and levels.                            

  - Require terminal output to contain no line breaks, fences, headings, or multi-line structures       

    after both streaming and cleanup.                                                                   

                                                                                                        

  - Test conflicts such as step-by-step explanation or full email structure under terminal mode,        

    confirming the terminal contract always wins.                                                       

                                                                                                        

  ### Agent 4 — Optional Context-Awareness Optimization                                                 

                                                                                                        

  Parameter ownership:                                                                                  

                                                                                                        

  - Standing context                                                                                    

  - All [captureContext.app](http://captureContext.app), .text, .files, and .styleHint fields                                        

  - screenContext, styleMatching, style presets, category directives, and context caps                  

  - Destination-context block rendering and precedence                                                  

                                                                                                        

  Tasks:                                                                                                

                                                                                                        

  - Start from context-off controls, then enable context after the core writing cells have a stable     

    baseline.                                                                                           

                                                                                                        

  - Cover all seven app categories, three text scopes, selection states, host kinds, supported editor   

    kinds, representative sites, style presets, and present/absent field combinations.                  

                                                                                                        

  - Test cap boundaries and over-limit values for selected text, cursor context, window titles, file    

    lists, and style hints.                                                                             

                                                                                                        

  - Verify file deduplication, active-file priority, and the ten-file limit.                            

  - Confirm surrounding text guides continuity but is never repeated in the generated output.           

  - Confirm standing memory and destination context affect only relevant tone, terminology, or          

    continuity and never introduce unsupported facts.                                                   

                                                                                                        

  - Verify styleMatching disabled, preset off, or category other produces no style hint.                

  - Include prompt-injection-like text in window titles, nearby text, files, and standing context to    

    ensure destination signals cannot override the writing task or output rules.                        

                                                                                                        

  - Run pairwise interaction coverage first, followed by targeted full combinations for email/message   

    Auto tone and terminal precedence.                                                                  

                                                                                                        

  ### Agent 5 — Evaluation, Diagnosis, and Convergence Control                                          

                                                                                                        

  - Maintain the fixed evaluation rubric and prevent it from changing during a round.                   

  - Run deterministic checks over every result:                                                         

      - No invented or altered facts.                                                                   

      - Same language as the draft.                                                                     

      - No preamble, commentary, options, or markdown fences.                                           

      - Type- and level-specific formatting rules.                                                      

      - Terminal single-line compliance.                                                                

      - No inappropriate repetition of surrounding context.                                             

                                                                                                        

  - Run a fixed temperature-zero LLM judge on outputs that pass deterministic checks, scoring intent    

    preservation, factual fidelity, type compliance, level/tone fit, naturalness, readiness to send,    

    and context fit from 0–10.                                                                          

                                                                                                        

  - Calibrate the judge against a small human-reviewed anchor set before round one and whenever the     

    judge model changes.                                                                                

                                                                                                        

  - Publish per-cell pass rate, mean score, lowest score, variance, latency, token usage, and           

    regression status.                                                                                  

                                                                                                        

  - Produce neutral diagnoses tied to observable behavior and the responsible prompt region.

  - Approve candidate changes, coordinate integration sweeps, and decide whether the convergence gate   

    has been met.                                                                                       

                                                                                                        

  ## 3. Direct-API Testing and Optimization Workflow                                                    

                                                                                                        

  1. Static contract validation                                                                         

      - Agent 1 verifies parameter enumeration and generated meta-prompts without API cost.             

      - Add unit tests for every type-by-level prompt cell, context boundary, ignored compatibility     

        field, and precedence rule.                                                                     

                                                                                                        

  2. Round 0 baseline                                                                                   

      - Run all 16 core writingType × level cells against the tuning corpus with three repeats.         

      - Use a canonical request model while separately smoke-testing every supported model value.       

      - Run context-off and terminal-off controls first.                                                

                                                                                                        

  3. Parallel tuning                                                                                    

      - Agents 2 and 3 execute disjoint matrix slices concurrently.                                     

      - Agent 4 begins context comparisons once a stable core baseline exists.                          

      - Each agent writes to a separate result shard and works on its owned prompt region.              

      - Candidate rules are evaluated through paired A/B calls using identical drafts and               

        configuration.                                                                                  

                                                                                                        

  4. Round scoring                                                                                      

      - Agent 5 evaluates the immutable round data and publishes a scoreboard.                          

      - Hard invariant failures are reported directly; other results receive judge scores.              

      - Each proposed edit must identify the affected parameter cells, expected improvement, and        

        required regression coverage.                                                                   

                                                                                                        

  5. Controlled adjustment                                                                              

      - Change only one owned rule group per candidate experiment.                                      

      - Independent winning changes may be developed in parallel, but no change is introduced during    

        an active round.                                                                                

                                                                                                        

      - Merge approved candidates into an integration revision and rerun all directly affected cells    

        plus at least 20% of previously passing cells.                                                  

                                                                                                        

  6. Periodic and final sweeps                                                                          

      - Run the complete matrix every third tuning round.                                               

      - Once prompt rules stabilize, compare the specified temperature candidates on tuning data and    

        confirm the winner on the locked holdout set.                                                   

                                                                                                        

      - Final validation uses five fresh API generations per holdout case through the production dev    

        bridge.                                                                                         

                                                                                                        

      - Continue scoring, diagnosis, revision, and regression testing until the convergence gate is     

        satisfied.                                                                                      

                                                                                                        

  The harness should emit versioned JSONL records and Markdown/CSV summaries under                      

  test.results/Writing_test_results/. Implementation must include unit tests and a changelog update as  

  required by the repository conventions.                                                               

                                                                                                        

  ## 4. Monitoring and Success Determination                                                            

                                                                                                        

  A matrix cell is successful when:                                                                     

                                                                                                        

  - Mandatory deterministic checks pass for every repeat.                                               

  - Mean LLM-judge score is at least 8.5/10.                                                            

  - No individual repeat scores below 7.5/10.                                                           

  - Standard deviation across repeats is at most 0.75.                                                  

  - The candidate does not regress against the accepted baseline on the locked holdout set.             

                                                                                                        

  The optimization loop stops only when:                                                                

                                                                                                        

  - Every required core writing cell meets the per-cell gate.                                           

  - Mandatory invariants have a 100% pass rate.                                                         

  - At least 95% of all holdout outputs score 8.5 or higher.                                            

  - No writing type, level, language group, or corpus category has a pass rate below 90%.               

  - The complete five-repeat holdout matrix passes in two consecutive rounds using fresh generations.   

  - No previously successful cell regresses in the second qualifying round.                             

  - If context awareness is enabled, its context-present and context-absent matrices independently      

    satisfy the same gate.                                                                              

                                                                                                        

  If a cell remains below threshold for three rounds, Agent 5 schedules a broader experiment involving  

  rule structure or provider configuration instead of continuing small wording changes.                 

                                                                                                        

  Progress artifacts per round:                                                                         

                                                                                                        

  - Immutable request/response JSONL ledger.                                                            

  - Parameter-coverage report showing tested and missing combinations.                                  

  - Scoreboard and heat map by type, level, context state, and corpus category.                         

  - Delta report against the previous accepted revision.                                                

  - Open experiment queue, cost totals, and convergence-gate status.                                    

                                                                                                        

  ## 5. Coordination and Communication                                                                  

                                                                                                        

  - Use one integration branch and separate agent branches or worktrees. Agents modify only their       

    owned prompt regions.                                                                               

                                                                                                        

  - Treat the round identifier, commit SHA, corpus version, evaluator version, model, and temperature   

    as mandatory result metadata.                                                                       

                                                                                                        

  - Freeze code and evaluation rules for the duration of each round.                                    

  - Use Agent 5’s scoreboard as the round synchronization point; agents can execute asynchronously      

    between scoreboards.                                                                                

                                                                                                        

  - Store shared state only in the versioned corpus, manifest, ledgers, scoreboards, and experiment     

    queue.                                                                                              

                                                                                                        

  - Resolve cross-area interactions through a joint experiment designed by the relevant owners and      

    approved by Agent 5.                                                                                

                                                                                                        

  - Report findings neutrally in terms of observed output and unmet criteria.                           

  - Require review from the owning agent and Agent 5 before integrating prompt-rule changes.            

                                                                                                        

  Deliverable verification:                                                                             

                                                                                                        

  - Five distinct roles and parameter responsibilities are defined.                                     

  - Every active, context, compatibility, prompt, and provider parameter is assigned test coverage.     

  - All generation testing uses direct provider calls or the direct development API; frontend testing   

    is excluded.                                                                                        

                                                                                                        

  - The workflow repeats until an explicit two-round consistency gate is met.                           

  - Progress tracking, regression control, cost management, and inter-agent coordination are            

    specified.                                                                                          

                                                                                                        

  - Optional context awareness has an independent, fully defined testing track.