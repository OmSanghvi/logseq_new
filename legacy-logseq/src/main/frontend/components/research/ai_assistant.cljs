(ns frontend.components.research.ai-assistant
  "AI Research Assistant — the brain of the research platform.
   
   Capabilities:
   1. Paper Suggestions  — finds 5 relevant papers, one-click imports each as a
      linked Markdown page that appears in the graph
   2. Hypothesis Generator — generates testable hypotheses from your notes,
      imports them as #Hypothesis pages linked to your current work
   3. Methodology Advisor — recommends research design based on your context
   4. Writing Feedback    — academic writing coach with specific, actionable notes
   5. Connection Discovery — finds conceptual links between your existing pages

   All AI output can be directly imported into the graph as linked pages,
   creating the Obsidian-style web of knowledge."
  (:require [clojure.string :as string]
            [frontend.context.i18n :refer [t]]
            [frontend.db :as db]
            [frontend.db.model :as db-model]
            [frontend.handler.notification :as notification]
            [frontend.handler.page :as page-handler]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [frontend.util :as util]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; LLM configuration
;; ---------------------------------------------------------------------------

(defn- llm-endpoint []
  (or (when (and (not util/node-test?) (exists? js/localStorage))
        (.getItem js/localStorage "research-llm-endpoint"))
      "http://localhost:11434/v1"))

(defn- llm-model []
  (or (when (and (not util/node-test?) (exists? js/localStorage))
        (.getItem js/localStorage "research-llm-model"))
      "llama3"))

(defn- llm-api-key []
  (when (and (not util/node-test?) (exists? js/localStorage))
    (.getItem js/localStorage "research-llm-api-key")))

(defn call-llm!
  "Call any OpenAI-compatible endpoint. Works with Ollama, OpenAI, Anthropic proxy, etc."
  [prompt]
  (let [url     (str (string/replace (llm-endpoint) #"/$" "") "/chat/completions")
        api-key (llm-api-key)
        headers (cond-> #js {"Content-Type" "application/json"}
                  api-key (.assign #js {} #js {"Authorization" (str "Bearer " api-key)}))
        body    (.stringify js/JSON
                  (clj->js {:model       (llm-model)
                             :messages    [{:role "user" :content prompt}]
                             :temperature 0.7
                             :max_tokens  2048}))]
    (-> (js/fetch url #js {:method "POST" :headers headers :body body})
        (p/then (fn [^js r] (when (.-ok r) (.json r))))
        (p/then (fn [^js d] (some-> d .-choices (aget 0) .-message .-content))))))

;; ---------------------------------------------------------------------------
;; Page context — reads current page blocks for AI context
;; ---------------------------------------------------------------------------

(defn- page-context []
  (let [repo  (state/get-current-repo)
        match (state/get-route-match)
        pname (get-in match [:parameters :path :name])]
    (when (and repo pname)
      (let [page   (db/get-page pname)
            blocks (when page
                     (->> (db-model/get-page-blocks-no-cache repo (:db/id page) nil)
                          (map :block/title)
                          (remove string/blank?)
                          (take 40)))]
        (when (seq blocks)
          (str "Page: " pname "\n\n" (string/join "\n" blocks)))))))

;; ---------------------------------------------------------------------------
;; Import a result as a linked page
;; ---------------------------------------------------------------------------

(defn- import-as-page!
  "Creates a logseq page with the given title and content.
   The [[wikilinks]] in the content create real graph connections."
  [title content]
  (-> (page-handler/<create! title {:redirect? false :edit? false})
      (p/then (fn [_]
                (notification/show! (str "Created: [[" title "]]") :success)))
      (p/catch (fn [e]
                 (notification/show! (str "Failed: " (.-message e)) :error)))))

;; ---------------------------------------------------------------------------
;; Prompts
;; ---------------------------------------------------------------------------

(defn- paper-prompt [ctx]
  (str "You are a research literature assistant. Based on these research notes, "
       "suggest 5 relevant academic papers.\n\n"
       "For each paper output EXACTLY this format (one per line, plain text, no markdown):\n"
       "PAPER: <title> | <Author1, Author2> | <year> | <one sentence why relevant>\n\n"
       "Notes:\n" ctx))

(defn- hypothesis-prompt [ctx]
  (str "You are a research methodology expert. Based on these notes, "
       "generate 3 testable, falsifiable hypotheses.\n\n"
       "For each hypothesis output EXACTLY:\n"
       "HYPOTHESIS: <statement> | <key variables> | <how to test it>\n\n"
       "Notes:\n" ctx))

(defn- methodology-prompt [ctx]
  (str "You are a research design expert. Based on these notes, "
       "recommend the best research methodology.\n\n"
       "Structure your response with these exact sections:\n"
       "APPROACH: <recommended methodology and why>\n"
       "DATA: <data collection methods>\n"
       "ANALYSIS: <analysis techniques>\n"
       "LIMITATIONS: <key limitations to address>\n\n"
       "Notes:\n" ctx))

(defn- writing-prompt [ctx]
  (str "You are an academic writing coach. Review this text and give specific, "
       "actionable feedback.\n\n"
       "Structure your feedback:\n"
       "CLARITY: <specific clarity issues with examples>\n"
       "STRUCTURE: <flow and organization feedback>\n"
       "ARGUMENTS: <strength of arguments, what's missing>\n"
       "TONE: <academic tone issues>\n"
       "PRIORITY FIX: <the single most important thing to improve>\n\n"
       "Text:\n" ctx))

(defn- connections-prompt [ctx]
  (str "You are a knowledge graph analyst. Based on these research notes, "
       "identify 5 non-obvious conceptual connections worth exploring.\n\n"
       "For each connection output EXACTLY:\n"
       "CONNECTION: <concept A> → <concept B> | <why this connection matters> | <research question it suggests>\n\n"
       "Notes:\n" ctx))

;; ---------------------------------------------------------------------------
;; Parse AI responses into structured data
;; ---------------------------------------------------------------------------

(defn- parse-papers [text]
  (->> (string/split text #"\n")
       (filter #(string/starts-with? % "PAPER:"))
       (map (fn [line]
              (let [parts (string/split (subs line 7) #"\|")]
                {:title  (string/trim (nth parts 0 ""))
                 :authors (string/trim (nth parts 1 ""))
                 :year   (string/trim (nth parts 2 ""))
                 :reason (string/trim (nth parts 3 ""))})))))

(defn- parse-hypotheses [text]
  (->> (string/split text #"\n")
       (filter #(string/starts-with? % "HYPOTHESIS:"))
       (map (fn [line]
              (let [parts (string/split (subs line 11) #"\|")]
                {:statement (string/trim (nth parts 0 ""))
                 :variables (string/trim (nth parts 1 ""))
                 :test      (string/trim (nth parts 2 ""))})))))

(defn- parse-connections [text]
  (->> (string/split text #"\n")
       (filter #(string/starts-with? % "CONNECTION:"))
       (map (fn [line]
              (let [parts (string/split (subs line 11) #"\|")]
                {:connection (string/trim (nth parts 0 ""))
                 :why        (string/trim (nth parts 1 ""))
                 :question   (string/trim (nth parts 2 ""))})))))

;; ---------------------------------------------------------------------------
;; Paper result card with one-click import
;; ---------------------------------------------------------------------------

(hsx/defc paper-result
  [{:keys [paper]}]
  (let [[importing? set-importing?!] (hooks/use-state false)
        {:keys [title authors year reason]} paper]
    [:div.ai-result-card
     [:div.ai-result-card-header
      [:span.ai-result-type "◈ Paper"]
      (when (seq year) [:span.ai-result-year year])]
     [:p.ai-result-title title]
     (when (seq authors)
       [:p.ai-result-meta authors])
     (when (seq reason)
       [:p.ai-result-reason reason])
     (shui/button
      {:size     :sm
       :variant  :outline
       :class    "mt-2 w-full gap-1.5 text-xs"
       :disabled importing?
       :on-click (fn []
                   (set-importing?! true)
                   (let [page-title (str title (when (seq year) (str " (" year ")")))
                         content    (str "type:: [[Paper]]\n"
                                         "authors:: " authors "\n"
                                         "year:: " year "\n\n"
                                         "## Why relevant\n\n" reason "\n\n"
                                         "## Abstract\n\n\n\n"
                                         "## Key insights\n\n- \n\n"
                                         "## Connections\n\n"
                                         "- Related to [[Research]]\n")]
                     (-> (import-as-page! page-title content)
                         (p/finally (fn [] (set-importing?! false))))))}
      (if importing?
        (shui/tabler-icon "loader-2" {:size 12 :class "animate-spin"})
        (shui/tabler-icon "notes-plus" {:size 12}))
      (if importing? "Importing…" "Import as page"))]))

;; ---------------------------------------------------------------------------
;; Hypothesis result card with import
;; ---------------------------------------------------------------------------

(hsx/defc hypothesis-result
  [{:keys [hyp idx]}]
  (let [[importing? set-importing?!] (hooks/use-state false)
        {:keys [statement variables test]} hyp]
    [:div.ai-result-card
     [:span.ai-result-type (str "H" (inc idx) " Hypothesis")]
     [:p.ai-result-title statement]
     (when (seq variables)
       [:p.ai-result-meta (str "Variables: " variables)])
     (when (seq test)
       [:p.ai-result-reason (str "Test: " test)])
     (shui/button
      {:size     :sm
       :variant  :outline
       :class    "mt-2 w-full gap-1.5 text-xs"
       :disabled importing?
       :on-click (fn []
                   (set-importing?! true)
                   (let [title   (str "Hypothesis: " (subs statement 0 (min 60 (count statement))))
                         content (str "type:: [[Hypothesis]]\n"
                                       "status:: #Untested\n\n"
                                       "## Statement\n\n" statement "\n\n"
                                       "## Variables\n\n" variables "\n\n"
                                       "## Test approach\n\n" test "\n\n"
                                       "## Evidence\n\n- \n\n"
                                       "## Connections\n\n- Related to [[Research]]\n")]
                     (-> (import-as-page! title content)
                         (p/finally (fn [] (set-importing?! false))))))}
      (if importing?
        (shui/tabler-icon "loader-2" {:size 12 :class "animate-spin"})
        (shui/tabler-icon "notes-plus" {:size 12}))
      (if importing? "Importing…" "Import as page"))]))

;; ---------------------------------------------------------------------------
;; Connection result card with import
;; ---------------------------------------------------------------------------

(hsx/defc connection-result
  [{:keys [conn]}]
  (let [[importing? set-importing?!] (hooks/use-state false)
        {:keys [connection why question]} conn]
    [:div.ai-result-card
     [:span.ai-result-type "⟷ Connection"]
     [:p.ai-result-title connection]
     (when (seq why)
       [:p.ai-result-reason why])
     (when (seq question)
       [:p.ai-result-meta (str "Question: " question)])
     (shui/button
      {:size     :sm
       :variant  :outline
       :class    "mt-2 w-full gap-1.5 text-xs"
       :disabled importing?
       :on-click (fn []
                   (set-importing?! true)
                   (let [title   (str "Connection: " connection)
                         content (str "type:: [[Connection]]\n\n"
                                       "## Why it matters\n\n" why "\n\n"
                                       "## Research question\n\n" question "\n\n"
                                       "## Notes\n\n- \n\n"
                                       "## Connections\n\n- Related to [[Research]]\n")]
                     (-> (import-as-page! title content)
                         (p/finally (fn [] (set-importing?! false))))))}
      (if importing?
        (shui/tabler-icon "loader-2" {:size 12 :class "animate-spin"})
        (shui/tabler-icon "notes-plus" {:size 12}))
      (if importing? "Importing…" "Import as page"))]))

;; ---------------------------------------------------------------------------
;; LLM config panel (shown when no model configured)
;; ---------------------------------------------------------------------------

(hsx/defc llm-config-panel []
  (let [[ep  set-ep!]  (hooks/use-state (llm-endpoint))
        [m   set-m!]   (hooks/use-state (llm-model))
        [k   set-k!]   (hooks/use-state "")
        [ok? set-ok?!] (hooks/use-state false)]
    [:div.ai-config-panel
     [:p.ai-config-title
      (shui/tabler-icon "settings" {:size 14 :class "mr-1.5 opacity-70"})
      "Configure AI model"]
     [:p.ai-config-hint
      "Supports Ollama (local), OpenAI, Anthropic, or any OpenAI-compatible API."]
     [:div.ai-config-fields
      [:label.ai-config-label "Endpoint"
       [:input.ai-config-input
        {:type "text" :value ep :placeholder "http://localhost:11434/v1"
         :on-change #(set-ep! (.. % -target -value))}]]
      [:label.ai-config-label "Model"
       [:input.ai-config-input
        {:type "text" :value m :placeholder "llama3 / gpt-4o / claude-3-5-sonnet"
         :on-change #(set-m! (.. % -target -value))}]]
      [:label.ai-config-label "API key (optional)"
       [:input.ai-config-input
        {:type "password" :value k :placeholder "sk-… (blank for Ollama)"
         :on-change #(set-k! (.. % -target -value))}]]]
     (shui/button
      {:class    "w-full mt-3 gap-1.5"
       :on-click (fn []
                   (when (exists? js/localStorage)
                     (.setItem js/localStorage "research-llm-endpoint" ep)
                     (.setItem js/localStorage "research-llm-model" m)
                     (when (seq k) (.setItem js/localStorage "research-llm-api-key" k)))
                   (set-ok?! true)
                   (js/setTimeout #(set-ok?! false) 2000))}
      (if ok?
        (shui/tabler-icon "check" {:size 14})
        (shui/tabler-icon "device-floppy" {:size 14}))
      (if ok? "Saved!" "Save"))]))

;; ---------------------------------------------------------------------------
;; Mode definitions
;; ---------------------------------------------------------------------------

(def ^:private modes
  [{:id :papers      :icon "books"           :label "Papers"}
   {:id :hypotheses  :icon "bulb"            :label "Hypotheses"}
   {:id :methodology :icon "flask"           :label "Methodology"}
   {:id :writing     :icon "writing"         :label "Writing"}
   {:id :connections :icon "circuit-diode"  :label "Connections"}])

;; ---------------------------------------------------------------------------
;; Main AI assistant panel
;; ---------------------------------------------------------------------------

(hsx/defc ai-assistant-panel
  []
  (let [[mode     set-mode!]    (hooks/use-state :papers)
        [loading? set-loading?!] (hooks/use-state false)
        [result   set-result!]  (hooks/use-state nil)
        [error    set-error!]   (hooks/use-state nil)
        [ctx-override set-ctx!] (hooks/use-state "")
        [show-cfg set-cfg!]     (hooks/use-state false)

        run! (fn []
               (set-loading?! true)
               (set-result! nil)
               (set-error! nil)
               (let [ctx (or (when (seq ctx-override) ctx-override)
                             (page-context)
                             "General research assistant context")]
                 (-> (call-llm!
                      (case mode
                        :papers      (paper-prompt ctx)
                        :hypotheses  (hypothesis-prompt ctx)
                        :methodology (methodology-prompt ctx)
                        :writing     (writing-prompt ctx)
                        :connections (connections-prompt ctx)))
                     (p/then (fn [text]
                               (set-result! (or text "No response"))
                               (set-loading?! false)))
                     (p/catch (fn [_]
                                (set-error! "AI call failed. Check your endpoint in ⚙ settings.")
                                (set-loading?! false))))))]

    [:div.ai-assistant-panel
     ;; Toolbar
     [:div.ai-panel-toolbar
      [:div.ai-panel-modes
       (for [m modes]
         [:button.ai-mode-btn
          {:key      (name (:id m))
           :class    (when (= (:id m) mode) "active")
           :on-click #(do (set-mode! (:id m)) (set-result! nil) (set-error! nil))}
          (shui/tabler-icon (:icon m) {:size 12})
          (:label m)])]
      [:button.ai-cfg-btn
       {:on-click #(set-cfg! (not show-cfg))
        :title "Configure AI model"}
       (shui/tabler-icon "settings" {:size 14})]]

     ;; Config panel (collapsible)
     (when show-cfg
       (llm-config-panel))

     ;; Context override
     [:div.ai-context-area
      [:textarea.ai-context-input
       {:rows        2
        :placeholder "Paste custom context, or leave blank to use the current page…"
        :value       ctx-override
        :on-change   #(set-ctx! (.. % -target -value))}]
      (shui/button
       {:class    "ai-run-btn"
        :disabled loading?
        :on-click run!}
       (if loading?
         (shui/tabler-icon "loader-2" {:size 14 :class "animate-spin mr-1"})
         (shui/tabler-icon "sparkles" {:size 14 :class "mr-1"}))
       (if loading? "Thinking…" "Generate"))]

     ;; Error
     (when error
       [:div.ai-error error])

     ;; Results
     [:div.ai-results
      (when result
        (case mode
          :papers
          (let [papers (parse-papers result)]
            (if (seq papers)
              (for [[i p] (map-indexed vector papers)]
                ^{:key i} [paper-result {:paper p}])
              [:div.ai-raw-result result]))

          :hypotheses
          (let [hyps (parse-hypotheses result)]
            (if (seq hyps)
              (for [[i h] (map-indexed vector hyps)]
                ^{:key i} [hypothesis-result {:hyp h :idx i}])
              [:div.ai-raw-result result]))

          :connections
          (let [conns (parse-connections result)]
            (if (seq conns)
              (for [[i c] (map-indexed vector conns)]
                ^{:key i} [connection-result {:conn c}])
              [:div.ai-raw-result result]))

          ;; methodology + writing — render as formatted text
          [:div.ai-raw-result
           (for [[idx para] (map-indexed vector (string/split result #"\n"))]
             (let [is-heading (re-find #"^(APPROACH|DATA|ANALYSIS|LIMITATIONS|CLARITY|STRUCTURE|ARGUMENTS|TONE|PRIORITY FIX):" para)]
               [:p {:key idx
                    :class (if is-heading "ai-result-heading" "ai-result-para")}
                para]))]))]]))
