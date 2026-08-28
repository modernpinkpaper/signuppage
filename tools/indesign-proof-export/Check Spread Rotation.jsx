/**
 * Check Spread Rotation.jsx
 *
 * Diagnostic. Run this on a document you know is laid out upside down and it
 * will tell you what rotation angle InDesign has saved for each spread.
 *
 * A spread you set to "View > Rotate Spread > 180 degrees" (and then saved)
 * should report 180 here. If it does, the auto-rotate export script has a
 * reliable flag to work from and you do not need to label anything yourself.
 */

#target indesign

(function () {

    if (app.documents.length === 0) {
        alert("Open an InDesign document first, then run this again.");
        return;
    }

    var doc = app.activeDocument;
    var lines = [];
    var found = false;

    for (var i = 0; i < doc.spreads.length; i++) {
        var spread = doc.spreads[i];
        var angle;

        try { angle = spread.rotation; } catch (e) { angle = undefined; }

        if (typeof angle === "number" && !isNaN(angle)) {
            found = true;
            lines.push("Spread " + (i + 1) + "  (pages " + pageNames(spread) + ")  ->  " + angle + " degrees");
        } else {
            lines.push("Spread " + (i + 1) + "  (pages " + pageNames(spread) + ")  ->  not reported");
        }
    }

    var header = found
        ? "InDesign is reporting the saved Rotate Spread View angle.\n" +
          "Anything showing 180 will be turned right way up on export.\n\n"
        : "This InDesign version is not exposing the spread view rotation to\n" +
          "scripting. Use the manual override described in the README instead.\n\n";

    alert(header + lines.join("\n"), "Spread rotation - " + doc.name);

    function pageNames(spread) {
        var names = [];
        for (var p = 0; p < spread.pages.length; p++) { names.push(spread.pages[p].name); }
        return names.join(", ");
    }

})();
