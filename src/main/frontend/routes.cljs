(ns frontend.routes
  "Defines routes for use with reitit router"
  (:require [frontend.components.all-pages :as all-pages]
            [frontend.components.bug-report :as bug-report]
            [frontend.components.file :as file]
            [frontend.components.graph :as graph]
            [frontend.components.home :as home]
            [frontend.components.imports :as imports]
            [frontend.components.journal :as journal]
            [frontend.components.page :as page]
            [frontend.components.plugins :as plugins]
            [frontend.components.repo :as repo]
            [frontend.components.research.core :as research-core]
            [frontend.components.research.ideation :as research-ideation]
            [frontend.components.research.paper-search :as research-paper-search]
            [frontend.components.research.graph-view :as research-graph-view]
            [frontend.components.research.writing :as research-writing]
            [frontend.components.settings :as settings]
            [frontend.components.user.login :as login]
            [frontend.config :as config]
            [io.factorhouse.hsx.core :as hsx]
            [logseq.shui.demo :as shui]))

;; http://localhost:3000/#?anchor=fn.1
(hsx/defc home-route
  [_route-match]
  (home/home))

(hsx/defc page-route
  [route-match]
  (page/page-cp (assoc route-match :current-page? true)))

;; Research route wrappers
(hsx/defc research-home-route       [_] (research-core/research-home))
(hsx/defc research-ideation-route   [_] (research-ideation/ideation))
(hsx/defc research-paper-search-route [_] (research-paper-search/paper-search))
(hsx/defc research-graph-route      [_] (research-graph-view/research-graph))
(hsx/defc research-writing-route    [_] (research-writing/writing-workspace))

(hsx/defc research-methods-route
  [_]
  ;; Opens the dedicated "research/methods" page via the normal page-cp path.
  (page/page-cp {:page-name "research/methods" :current-page? true}))

(hsx/defc research-validation-route
  [_]
  (page/page-cp {:page-name "research/validation" :current-page? true}))

(def routes
  [["/"
    {:name :home
     :view home-route}]

   ;; -----------------------------------------------------------------------
   ;; Research IDE routes
   ;; -----------------------------------------------------------------------
   ["/research"
    {:name :research/home
     :view research-home-route}]

   ["/research/ideation"
    {:name :research/ideation
     :view research-ideation-route}]

   ["/research/methods"
    {:name :research/methods
     :view research-methods-route}]

   ["/research/validation"
    {:name :research/validation
     :view research-validation-route}]

   ["/research/writing"
    {:name :research/writing
     :view research-writing-route}]

   ["/research/paper-search"
    {:name :research/paper-search
     :view research-paper-search-route}]

   ["/research/graph"
    {:name :research/graph
     :view research-graph-route}]

   ;; -----------------------------------------------------------------------
   ;; Original routes
   ;; -----------------------------------------------------------------------
   ["/graphs"
    {:name :graphs
     :view repo/repos-cp}]

   ["/page/:name"
    {:name :page
     :view page-route}]

   ["/page/:name/block/:block-route-name"
    {:name :page-block
     :view page/page-cp}]

   ["/all-pages"
    {:name :all-pages
     :view all-pages/all-pages}]

   ["/graph"
    {:name :graph
     :view graph/global-graph}]

   ["/settings"
    {:name :settings
     :view settings/settings}]

   ["/import"
    {:name :import
     :view imports/importer}]

   ["/bug-report"
    {:name :bug-report
     :view bug-report/bug-report}]

   ["/bug-report-tool/:tool"
    {:name :bug-report-tools
     :view bug-report/bug-report-tool-route}]

   ["/all-journals"
    {:name :all-journals
     :view journal/all-journals}]

   ["/plugins"
    {:name :plugins
     :view plugins/plugins-page}]

   ["/login"
    {:name :user-login
     :view login/page}]

   ["/all-files"
    {:name :all-files
     :view file/files}]

   ["/file/:path"
    {:name :file
     :view file/file}]

   (when config/dev?
     ["/ui"
      {:name :ui
       :view shui/page}])])
