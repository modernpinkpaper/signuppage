/**
 * Export Proofs (auto-rotate).jsx
 *
 * Exports JPEG proofs from the active InDesign document and automatically
 * turns any page the right way up when it was laid out upside down.
 *
 * HOW IT KNOWS
 * ------------
 * It reads the spread's saved "View > Rotate Spread" angle. That setting is
 * view-only -- it deliberately does not affect print or export, which is
 * exactly why an upside-down layout exports upside down. InDesign saves the
 * angle in the document, so it doubles as a flag: whatever angle you were
 * viewing a spread at is the angle applied to that spread's exported JPEG.
 *
 * You have to save the .indd with the view still rotated. If you rotate the
 * view back to 0 before saving, the flag is gone.
 *
 * MANUAL OVERRIDE
 * ---------------
 * If you ever need to force it, add a script label named "proofRotation" to
 * the spread with a value of 0, 90, 180 or 270. That wins over the view angle.
 *
 * Requires InDesign CS6 or later. On macOS it rotates with the built-in
 * `sips`; on Windows with PowerShell + System.Drawing. Nothing to install.
 */

#target indesign

(function () {

    if (app.documents.length === 0) {
        alert("Open the document you want to proof, then run this again.");
        return;
    }

    var doc = app.activeDocument;

    var docSaved = false;
    try { docSaved = (doc.saved && doc.fullName !== null); } catch (e) { docSaved = false; }

    var settings = askSettings(docSaved);
    if (settings === null) { return; }

    var outputFolder = chooseOutputFolder(doc, settings, docSaved);
    if (outputFolder === null) { return; }

    var baseName = docBaseName(doc);
    var exported = [];
    var rotateJobs = [];
    var rotationReported = false;
    var errors = [];

    applyExportPreferences(settings);

    for (var s = 0; s < doc.spreads.length; s++) {
        var spread = doc.spreads[s];
        var reading = readSpreadRotation(spread);
        if (reading.reported) { rotationReported = true; }
        var angle = reading.angle;

        var targets = settings.exportSpreads
            ? [{ pageString: spread.pages[0].name, label: spreadLabel(spread) }]
            : pageTargets(spread);

        for (var t = 0; t < targets.length; t++) {
            var target = targets[t];
            var file = new File(outputFolder.fsName + "/" + baseName + "_" + safeName(target.label) + ".jpg");

            try {
                app.jpegExportPreferences.pageString = target.pageString;
                doc.exportFile(ExportFormat.JPG, file);
            } catch (e) {
                errors.push(target.label + ": " + e);
                continue;
            }

            exported.push(file);
            if (settings.autoRotate && angle !== 0) {
                rotateJobs.push({ file: file, degrees: angle });
            }
        }
    }

    var rotated = 0;
    if (rotateJobs.length > 0) {
        if (rotateImages(rotateJobs)) { rotated = rotateJobs.length; }
    }

    report(exported, rotated, outputFolder, rotationReported, settings, errors);

    /* ---------------------------------------------------------------- */

    function askSettings(isSaved) {
        var dialog = app.dialogs.add({ name: "Export Proofs" });
        var column = dialog.dialogColumns.add();

        var rowRes = column.dialogRows.add();
        rowRes.staticTexts.add({ staticLabel: "Resolution (ppi):" });
        var resolutionField = rowRes.integerEditboxes.add({
            editValue: 150, minimumValue: 36, maximumValue: 600
        });

        var rowRotate = column.dialogRows.add();
        var rotateBox = rowRotate.checkboxControls.add({
            staticLabel: "Turn upside-down spreads right way up",
            checkedState: true
        });

        var rowSpreads = column.dialogRows.add();
        var spreadsBox = rowSpreads.checkboxControls.add({
            staticLabel: "Export whole spreads instead of single pages",
            checkedState: false
        });

        var rowBleed = column.dialogRows.add();
        var bleedBox = rowBleed.checkboxControls.add({
            staticLabel: "Include document bleed",
            checkedState: false
        });

        var rowFolder = column.dialogRows.add();
        var folderBox = rowFolder.checkboxControls.add({
            staticLabel: "Pick the output folder (default: a Proofs folder beside the file)",
            checkedState: !isSaved
        });

        if (!dialog.show()) { dialog.destroy(); return null; }

        var settings = {
            resolution:    resolutionField.editValue,
            autoRotate:    rotateBox.checkedState,
            exportSpreads: spreadsBox.checkedState,
            bleed:         bleedBox.checkedState,
            pickFolder:    folderBox.checkedState || !isSaved
        };
        dialog.destroy();
        return settings;
    }

    function chooseOutputFolder(doc, settings, isSaved) {
        if (!settings.pickFolder && isSaved) {
            var beside = new Folder(doc.fullName.parent.fsName + "/Proofs");
            if (!beside.exists && !beside.create()) {
                alert("Could not create:\n" + beside.fsName);
                return null;
            }
            return beside;
        }
        var picked = Folder.selectDialog("Where should the proofs go?");
        if (picked === null) { return null; }
        return picked;
    }

    function applyExportPreferences(settings) {
        var prefs = app.jpegExportPreferences;
        setPref(prefs, "exportResolution",  settings.resolution);
        setPref(prefs, "jpegQuality",       JPEGOptionsQuality.HIGH);
        setPref(prefs, "jpegColorSpace",    JpegColorSpaceEnum.RGB);
        setPref(prefs, "antiAlias",         true);
        setPref(prefs, "embedColorProfile", true);
        setPref(prefs, "simulateOverprint", false);
        setPref(prefs, "useDocumentBleeds", settings.bleed);
        setPref(prefs, "exportingSpread",   settings.exportSpreads);
        setPref(prefs, "jpegExportRange",   ExportRangeOrAllPages.EXPORT_RANGE);
    }

    function setPref(prefs, key, value) {
        try { prefs[key] = value; } catch (e) {}
    }

    /**
     * Returns { angle: 0|90|180|270, reported: Boolean }.
     * `reported` is false when this InDesign build does not expose the view
     * rotation, so we can warn instead of silently exporting everything as-is.
     */
    function readSpreadRotation(spread) {
        var override = readOverride(spread);
        if (override !== null) { return { angle: override, reported: true }; }

        var angle;
        try { angle = spread.rotation; } catch (e) { angle = undefined; }

        if (typeof angle === "number" && !isNaN(angle)) {
            return { angle: normalizeAngle(angle), reported: true };
        }
        return { angle: 0, reported: false };
    }

    function readOverride(spread) {
        var raw;
        try { raw = spread.extractLabel("proofRotation"); } catch (e) { return null; }
        if (raw === undefined || raw === null || raw === "") { return null; }
        var parsed = parseInt(raw, 10);
        if (isNaN(parsed)) { return null; }
        return normalizeAngle(parsed);
    }

    function normalizeAngle(angle) {
        var a = Math.round(angle / 90) * 90 % 360;
        if (a < 0) { a += 360; }
        return a;
    }

    function pageTargets(spread) {
        var targets = [];
        for (var p = 0; p < spread.pages.length; p++) {
            targets.push({ pageString: spread.pages[p].name, label: spread.pages[p].name });
        }
        return targets;
    }

    function spreadLabel(spread) {
        var names = [];
        for (var p = 0; p < spread.pages.length; p++) { names.push(spread.pages[p].name); }
        return names.join("-");
    }

    function docBaseName(doc) {
        return safeName(doc.name.replace(/\.indd$/i, ""));
    }

    function safeName(text) {
        return String(text).replace(/[^A-Za-z0-9._-]+/g, "-");
    }

    /* ------------------------- image rotation ------------------------- */

    function rotateImages(jobs) {
        var isMac = (String($.os).toLowerCase().indexOf("mac") !== -1);
        try {
            return isMac ? rotateWithSips(jobs) : rotateWithPowerShell(jobs);
        } catch (e) {
            alert("The proofs exported, but rotating them failed:\n\n" + e);
            return false;
        }
    }

    function rotateWithSips(jobs) {
        var lines = ["#!/bin/sh"];
        for (var i = 0; i < jobs.length; i++) {
            lines.push("/usr/bin/sips -r " + jobs[i].degrees + " " +
                       shellQuote(jobs[i].file.fsName) + " > /dev/null");
        }
        var script = writeTempFile("id-proof-rotate", ".sh", lines.join("\n") + "\n");
        try {
            app.doScript(
                'do shell script "/bin/sh " & quoted form of "' + script.fsName + '"',
                ScriptLanguage.APPLESCRIPT_LANGUAGE
            );
        } finally {
            script.remove();
        }
        return true;
    }

    function rotateWithPowerShell(jobs) {
        var lines = [
            "Add-Type -AssemblyName System.Drawing",
            "function Rotate-One([string]$Path, [int]$Deg) {",
            "  $src = [System.Drawing.Image]::FromFile($Path)",
            "  $bmp = New-Object System.Drawing.Bitmap $src",
            "  $src.Dispose()",
            "  if ($Deg -eq 90)  { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }",
            "  if ($Deg -eq 180) { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }",
            "  if ($Deg -eq 270) { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }",
            "  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Jpeg)",
            "  $bmp.Dispose()",
            "}"
        ];
        for (var i = 0; i < jobs.length; i++) {
            lines.push("Rotate-One " + psQuote(jobs[i].file.fsName) + " " + jobs[i].degrees);
        }
        var script = writeTempFile("id-proof-rotate", ".ps1", lines.join("\r\n") + "\r\n");
        try {
            app.doScript(
                'Set sh = CreateObject("WScript.Shell")\r' +
                'sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""' +
                script.fsName + '""", 0, True',
                ScriptLanguage.VISUAL_BASIC
            );
        } finally {
            script.remove();
        }
        return true;
    }

    function writeTempFile(prefix, extension, body) {
        var file = new File(Folder.temp.fsName + "/" + prefix + "-" +
                            (new Date()).getTime() + extension);
        file.encoding = "UTF-8";
        if (!file.open("w")) { throw new Error("Could not write " + file.fsName); }
        file.write(body);
        file.close();
        return file;
    }

    function shellQuote(path) {
        return "'" + String(path).replace(/'/g, "'\\''") + "'";
    }

    function psQuote(path) {
        return "'" + String(path).replace(/'/g, "''") + "'";
    }

    /* ----------------------------- report ----------------------------- */

    function report(exported, rotated, folder, rotationReported, settings, errors) {
        var message = exported.length + " proof" + (exported.length === 1 ? "" : "s") +
                      " exported to:\n" + folder.fsName + "\n\n";

        if (!settings.autoRotate) {
            message += "Auto-rotate was switched off for this run.";
        } else if (rotated > 0) {
            message += rotated + " of them were laid out upside down and have been turned right way up.";
        } else if (!rotationReported) {
            message += "Heads up: this InDesign version did not report any Rotate Spread View\n" +
                       "angle, so nothing could be turned automatically. See the README for\n" +
                       "the manual \"proofRotation\" label override.";
        } else {
            message += "No spread was rotated in the layout, so nothing needed turning.\n" +
                       "If a proof is still upside down, save the .indd with View > Rotate\n" +
                       "Spread still set to 180 and run this again.";
        }

        if (errors.length > 0) {
            message += "\n\nThese did not export:\n" + errors.join("\n");
        }

        alert(message, "Export Proofs");
    }

})();
