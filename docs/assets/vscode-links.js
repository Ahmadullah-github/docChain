(function () {
  function normalizeRepoRoot(root) {
    if (!root) return "../../";
    return root.endsWith("/") ? root : root + "/";
  }

  function fileUrlToPath(fileUrl) {
    var url = new URL(fileUrl.href);
    var path = decodeURIComponent(url.pathname);

    if (/^\/[A-Za-z]:\//.test(path)) {
      path = path.slice(1);
    }

    return path;
  }

  function buildVsCodeHref(link) {
    var codePath = (link.dataset.codePath || "").replace(/^\/+/, "");
    var codeLine = link.dataset.codeLine || "1";
    var repoRoot = normalizeRepoRoot(link.dataset.repoRoot || "../../");
    var fileUrl = new URL(repoRoot + codePath, window.location.href);
    return "vscode://file/" + encodeURI(fileUrlToPath(fileUrl)) + ":" + codeLine;
  }

  function ready(run) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  ready(function () {
    document.querySelectorAll("a[data-code-path]").forEach(function (link) {
      link.setAttribute("href", buildVsCodeHref(link));
      link.setAttribute("target", "_self");
      link.setAttribute("rel", "noreferrer");
    });
  });
})();
