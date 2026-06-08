(ns frontend.components.research.ai-assistant
  "AI research assistant panel.
   Supports: paper suggestions from current note, hypothesis generation,
   methodology recommendations, and writing feedback.
   Uses the existing embedding server when available, falls back to
   open LLM APIs (Ollama / OpenAI-compatible)."
  (:require [clojure.string :as string]
            [frontend.context.i18n :refer [t]]
            [frontend.db :as db]
            [frontend.db.model :as db-model]
            [frontend.state :as state]
            [frontend.util :as util]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; AI mode definitions
;; ---------------------------------------------------------------------------

(def ^:private ai-modes
  [{:id :paper-suggestions
    :icon "books"
    :label-key :research.ai/mode-papers}
   {:id :hypothesis
    :icon "bulb"
    :label-key :research.ai/mode-hypothesis}
   {:id :methodology
    :icon "flask"
    :label-key :research.ai/mode-methods}
   {:id :writing-feedback
    :icon "writing"
    :label-key :research.ai/mode-writing}])

;; ---------------------------------------------------------------------------
;; Prompt builders per mode
;; ---------------------------------------------------------------------------

(defmulti ^:private build-prompt
  (fn [mode context] mode))

(defmethod build-prompt :paper-suggestions
  [_ context]
  (str "You are a research literature assistant. Based on the following research notes, "
       "suggest 5 relevant academic papers to read next. For each paper give: "
       "title, why it is relevant (2 sentences), and a suggested search query for Semantic Scholar.\n\n"
       "Research notes:\n" context))

(defmethod build-prompt :hypothesis
  [_ context]
  (str "You are a research methodology expert. Based on the following research context, "
       "generate 3 testable hypotheses. For each hypothesis, provide: "
       "the hypothesis statement, key variables, and a suggested experimental approach.\n\n"
       "Research context:\n" context))

(defmethod build-prompt :methodology
  [_ context]
  (str "You are a research design expert. Based on the following research context, "
       "recommend an appropriate research methodology. Include: "
       "1) Recommended approach and rationale, "
       "2) Data collection methods, "
       "3) Analysis techniques, "
       "4) Potential limitations to address.\n\n"
       "Research context:\n" context))

(defmethod build-prompt :writing-feedback
  [_ context]
  (str "You are an academic writing coach. Review the following research text and provide "
       "constructive feedback on: "
       "1) Clarity and precision of language, "
       "2) Logical flow and structure, "
       "3) Strength of arguments, "
       "4) Academic tone. "
       "Be specific and actionable.\n\n"
       "Text:\n" context))

(defmethod build-prompt :default
  [_ context]
  (str "You are a research assistant. Help with the following:\n\n" context))

;; ---------------------------------------------------------------------------
;; LLM API call (OpenAI-compatible; defaults to local Ollama)
;; ---------------------------------------------------------------------------

(defn- get-llm-endpoint
  "Return the configured LLM base URL, falling back to local Ollama."
  []
  (or (when-not util/node-test?
        (when (exists? js/localStorage)
          (.getItem js/localStorage "research-llm-endpoint")))
      "http://localhost:11434/v1"))

(defn- get-llm-model
  []
  (or (when (and (not util/node-test?) (exists? js/localStorage))
        (.getItem js/localStorage "research-llm-model"))
      "llama3"))

(defn call-llm!
  "Call an OpenAI-compatible chat completion endpoint."
  [prompt]
  (let [endpoint (str (get-llm-endpoint) "/chat/completions")
        body (clj->js
              {:model (get-llm-model)
               :messages [{:role "user" :content prompt}]
               :temperature 0.7
               :max_tokens 1024})]
    (-> (js/fetch endpoint
                  #js {:method "POST"
                       :headers #js {"Content-Type" "application/json"
                                     "Accept" "application/json"}
                       :body (.stringify js/JSON body)})
        (p/then (fn [^js resp]
                  (when (.-ok resp) (.json resp))))
        (p/then (fn [^js data]
                  (when data
                    (-> data
                        (.-choices)
                        (aget 0)
                        (.-message)
                        (.-content))))))))

;; ---------------------------------------------------------------------------
;; Get current page text for context
;; ---------------------------------------------------------------------------

(defn- current-page-context
  "Extract plain text from the current page's blocks for AI context."
  []
  (let [current-repo (state/get-current-repo)
        route-match  (state/get-route-match)
        ;; reitit stores path params at [:parameters :path :name]
        page-name    (get-in route-match [:parameters :path :name])]
    (when (and current-repo page-name)
      (let [page   (db/get-page page-name)
            blocks (when page
                     (->> (db-model/get-page-blocks-no-cache current-repo (:db/id page) nil)
                          (map :block/title)
                          (remove string/blank?)
                          (take 50)))]
        (when (seq blocks)
          (string/join "\n" blocks))))))

;; ---------------------------------------------------------------------------
;; Mode tab button
;; ---------------------------------------------------------------------------

(hsx/defc mode-tab
  [{:keys [mode active? on-click]}]
  (shui/button
   {:variant (if active? :default :ghost)
    :size :sm
    :class "text-xs gap-1.5"
    :on-click on-click}
   (shui/tabler-icon (:icon mode) {:size 13})
   (t (:label-key mode))))

;; ---------------------------------------------------------------------------
;; Response renderer
;; ---------------------------------------------------------------------------

(hsx/defc ai-response
  [{:keys [text loading? error]}]
  (cond
    loading?
    [:div.flex.items-center.gap-2.py-4.text-muted-foreground.text-sm
     (shui/tabler-icon "loader-2" {:class "animate-spin" :size 16})
     (t :research.ai/thinking)]

    error
    [:div.text-destructive.text-sm.py-2 error]

    text
    [:div.ai-response-text.prose.prose-sm.max-w-none.py-2
     ;; Render as simple paragraphs; markdown rendering hooks in if available
     (for [[idx para] (map-indexed vector (string/split text #"\n\n"))]
       [:p {:key idx :class "text-sm text-foreground leading-relaxed mb-2"} para])]

    :else nil))

;; ---------------------------------------------------------------------------
;; Main AI assistant panel
;; ---------------------------------------------------------------------------

(hsx/defc ai-assistant-panel
  []
  (let [[active-mode set-active-mode!] (hooks/use-state :paper-suggestions)
        [loading? set-loading?!] (hooks/use-state false)
        [response set-response!] (hooks/use-state nil)
        [error set-error!] (hooks/use-state nil)
        [custom-prompt set-custom-prompt!] (hooks/use-state "")

        run-ai! (fn []
                  (set-loading?! true)
                  (set-response! nil)
                  (set-error! nil)
                  (let [ctx (or (when-not (string/blank? custom-prompt) custom-prompt)
                                (current-page-context)
                                (t :research.ai/no-context-fallback))
                        prompt (build-prompt active-mode ctx)]
                    (-> (call-llm! prompt)
                        (p/then (fn [text]
                                  (set-response! (or text (t :research.ai/empty-response)))
                                  (set-loading?! false)))
                        (p/catch (fn [_]
                                   (set-error! (t :research.ai/call-error))
                                   (set-loading?! false))))))]

    [:div.ai-assistant-panel.flex.flex-col.h-full
     ;; Mode tabs
     [:div.flex.gap-1.flex-wrap.p-3.border-b
      (for [mode ai-modes]
        ^{:key (:id mode)}
        [mode-tab {:mode mode
                   :active? (= (:id mode) active-mode)
                   :on-click #(do (set-active-mode! (:id mode))
                                  (set-response! nil)
                                  (set-error! nil))}])]

     ;; Context override textarea
     [:div.p-3.border-b
      [:label.text-xs.text-muted-foreground.block.mb-1
       (t :research.ai/context-label)]
      [:textarea.w-full.rounded-md.border.border-input.bg-background.text-sm.p-2.resize-none
       {:rows 3
        :placeholder (t :research.ai/context-placeholder)
        :value custom-prompt
        :on-change #(set-custom-prompt! (.. % -target -value))}]]

     ;; Run button
     [:div.p-3.border-b
      (shui/button
       {:class "w-full gap-2"
        :disabled loading?
        :on-click run-ai!}
       (shui/tabler-icon "sparkles" {:size 15})
       (t :research.ai/run-btn))]

     ;; Response area
     [:div.flex-1.overflow-y-auto.p-3
      (ai-response {:text response :loading? loading? :error error})]]))
