/**
 * Export Proofs (auto-rotate).jsx
 *
 * Exports JPEG proofs from InDesign and automatically turns the ones that were
 * laid out upside down the right way up, so the proof you send out reads
 * normally.
 *
 * Works on one open document, or on a whole folder of .indd files at once.
 *
 * HOW IT KNOWS WHICH ONES TO TURN
 * -------------------------------
 * It reads the saved "View > Rotate Spread" angle. That setting is view-only --
 * it deliberately does not affect print or export, which is exactly why an
 * upside-down layout exports upside down. InDesign stores the angle inside the
 * .indd file, so it doubles as a flag, and it reads the same on Windows and
 * Mac. Nothing extra to label.
 *
 * You do have to save the .indd with the view still rotated. Rotate it back to
 * 0 before saving and the flag is gone.
 *
 * MANUAL OVERRIDE
 * ---------------
 * To force a specific rotation regardless of the view angle, give the spread a
 * script label named "proofRotation" set to 0, 90, 180 or 270.
 *
 * Requires InDesign CS6 or later. Windows rotates with built-in PowerShell,
 * macOS with built-in sips. Nothing to install. Source files are never changed.
 */

#target indesign

(function () {

    var JPEG_QUALITY_ON_ROTATE = 92;   // re-encode quality for flipped proofs
    var ROTATE_TIMEOUT_MS      = 180000;

    var settings = askSettings();
    if (settings === null) { return; }

    var sources = collectSources(settings);
    if (sources === null) { return; }
    if (sources.length === 0) {
        alert("No InDesign files found to proof.");
        return;
    }

    var outputFolder = chooseOutputFolder(settings, sources);
    if (outputFolder === null) { return; }

    var exported         = [];
    var rotateJobs       = [];
    var errors           = [];
    var rotationReported = false;

    var previousInteraction = app.scriptPreferences.userInteractionLevel;
    if (settings.batch) {
        app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
    }

    try {
        applyExportPreferences(settings);

        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            var doc    = null;
            var opened = false;

            try {
                if (source.doc !== null) {
                    doc = source.doc;
                } else {
                    doc = app.open(source.file, false);
                    opened = true;
                }

                var result = exportDocument(doc, outputFolder, settings);
                exported   = exported.concat(result.exported);
                rotateJobs = rotateJobs.concat(result.rotateJobs);
                errors     = errors.concat(result.errors);
                if (result.rotationReported) { rotationReported = true; }

            } catch (e) {
                errors.push(source.name + ": " + e);
            } finally {
                if (opened && doc !== null) {
                    try { doc.close(SaveOptions.NO); } catch (e2) {}
                }
            }
        }
    } finally {
        app.scriptPreferences.userInteractionLevel = previousInteraction;
    }

    var rotated = 0;
    var rotateError = null;
    if (rotateJobs.length > 0) {
        try {
            rotateImages(rotateJobs);
            rotated = rotateJobs.length;
        } catch (e) {
            rotateError = String(e);
        }
    }

    report(exported, rotated, outputFolder, rotationReported, settings, errors, rotateError);

    /* ------------------------------ setup ------------------------------ */

    function askSettings() {
        var hasOpenDoc = (app.documents.length > 0);

        var dialog = app.dialogs.add({ name: "Export Proofs" });
        var column = dialog.dialogColumns.add();

        var rowSource = column.dialogRows.add();
        rowSource.staticTexts.add({ staticLabel: "Proof:" });
        var sourceMenu = rowSource.dropdowns.add({
            stringList: ["The document that is open", "Every InDesign file in a folder"],
            selectedIndex: hasOpenDoc ? 0 : 1
        });

        var rowRes = column.dialogRows.add();
        rowRes.staticTexts.add({ staticLabel: "Resolution (ppi):" });
        var resolutionField = rowRes.integerEditboxes.add({
            editValue: 150, minimumValue: 36, maximumValue: 600
        });

        var rowRotate = column.dialogRows.add();
        var rotateBox = rowRotate.checkboxControls.add({
            staticLabel: "Turn upside-down files right way up",
            checkedState: true
        });

        var rowBleed = column.dialogRows.add();
        var bleedBox = rowBleed.checkboxControls.add({
            staticLabel: "Include bleed",
            checkedState: false
        });

        var rowFolder = column.dialogRows.add();
        var folderBox = rowFolder.checkboxControls.add({
            staticLabel: "Choose where the proofs are saved",
            checkedState: false
        });

        if (!dialog.show()) { dialog.destroy(); return null; }

        var chosen = {
            batch:      (sourceMenu.selectedIndex === 1),
            resolution: resolutionField.editValue,
            autoRotate: rotateBox.checkedState,
            bleed:      bleedBox.checkedState,
            pickFolder: folderBox.checkedState
        };
        dialog.destroy();

        if (!chosen.batch && !hasOpenDoc) {
            alert("No document is open. Open one, or run this again and choose the folder option.");
            return null;
        }
        return chosen;
    }

    function collectSources(settings) {
        var sources = [];

        if (!settings.batch) {
            var doc = app.activeDocument;
            sources.push({ doc: doc, file: null, name: doc.name });
            return sources;
        }

        var folder = Folder.selectDialog("Pick the folder of InDesign files to proof");
        if (folder === null) { return null; }

        var files = folder.getFiles("*.indd");
        for (var i = 0; i < files.length; i++) {
            if (files[i] instanceof File) {
                sources.push({ doc: null, file: files[i], name: files[i].name });
            }
        }
        sources.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
        return sources;
    }

    function chooseOutputFolder(settings, sources) {
        if (!settings.pickFolder) {
            var anchor = null;
            for (var i = 0; i < sources.length && anchor === null; i++) {
                if (sources[i].file !== null) {
                    anchor = sources[i].file.parent;
                } else {
                    try { anchor = sources[i].doc.fullName.parent; } catch (e) { anchor = null; }
                }
            }
            if (anchor !== null) {
                var beside = new Folder(anchor.fsName + "/Proofs");
                if (beside.exists || beside.create()) { return beside; }
            }
        }
        var picked = Folder.selectDialog("Where should the proofs be saved?");
        return picked; // null if cancelled
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
        setPref(prefs, "exportingSpread",   false);
        setPref(prefs, "jpegExportRange",   ExportRangeOrAllPages.EXPORT_RANGE);
    }

    function setPref(prefs, key, value) {
        try { prefs[key] = value; } catch (e) {}
    }

    /* ----------------------------- export ----------------------------- */

    function exportDocument(doc, outputFolder, settings) {
        var result = { exported: [], rotateJobs: [], errors: [], rotationReported: false };
        var baseName = safeName(doc.name.replace(/\.indd$/i, ""));
        var multiPage = (doc.pages.length > 1);

        for (var s = 0; s < doc.spreads.length; s++) {
            var spread  = doc.spreads[s];
            var reading = readSpreadRotation(spread);
            if (reading.reported) { result.rotationReported = true; }

            for (var p = 0; p < spread.pages.length; p++) {
                var page = spread.pages[p];
                var name = multiPage ? (baseName + "_" + safeName(page.name)) : baseName;
                var file = new File(outputFolder.fsName + "/" + name + ".jpg");

                try {
                    app.jpegExportPreferences.pageString = page.name;
                    doc.exportFile(ExportFormat.JPG, file);
                } catch (e) {
                    result.errors.push(doc.name + " page " + page.name + ": " + e);
                    continue;
                }

                result.exported.push(file);
                if (settings.autoRotate && reading.angle !== 0) {
                    result.rotateJobs.push({ file: file, degrees: reading.angle });
                }
            }
        }
        return result;
    }

    /**
     * Returns { angle: 0|90|180|270, reported: Boolean }.
     * `reported` is false when this InDesign build does not expose the saved
     * view rotation, so we can say so instead of silently doing nothing.
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
        return isNaN(parsed) ? null : normalizeAngle(parsed);
    }

    function normalizeAngle(angle) {
        var a = Math.round(angle / 90) * 90 % 360;
        if (a < 0) { a += 360; }
        return a;
    }

    function safeName(text) {
        return String(text).replace(/[^A-Za-z0-9._-]+/g, "-");
    }

    /* ------------------------- image rotation ------------------------- */

    function rotateImages(jobs) {
        var isWindows = (String($.os).toLowerCase().indexOf("windows") !== -1);
        if (isWindows) { rotateOnWindows(jobs); } else { rotateOnMac(jobs); }
    }

    /**
     * PowerShell + System.Drawing, both built into Windows. Preferred launch is
     * VBScript (synchronous, no console window). Newer Windows builds can have
     * VBScript disabled, so fall back to a .bat that drops a flag file when it
     * finishes, and wait for that.
     */
    function rotateOnWindows(jobs) {
        var lines = [
            "$ErrorActionPreference = 'Stop'",
            "Add-Type -AssemblyName System.Drawing",
            "$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |",
            "         Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1",
            "function Rotate-One([string]$Path, [int]$Deg) {",
            "  $src = [System.Drawing.Image]::FromFile($Path)",
            "  $dpiX = $src.HorizontalResolution",
            "  $dpiY = $src.VerticalResolution",
            "  $bmp = New-Object System.Drawing.Bitmap -ArgumentList $src",
            "  $src.Dispose()",
            "  $bmp.SetResolution($dpiX, $dpiY)",
            "  if ($Deg -eq 90)  { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }",
            "  if ($Deg -eq 180) { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }",
            "  if ($Deg -eq 270) { $bmp.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }",
            "  $ps = New-Object System.Drawing.Imaging.EncoderParameters -ArgumentList 1",
            "  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter " +
                "-ArgumentList ([System.Drawing.Imaging.Encoder]::Quality), ([int64]" +
                JPEG_QUALITY_ON_ROTATE + ")",
            "  $bmp.Save($Path, $codec, $ps)",
            "  $ps.Dispose()",
            "  $bmp.Dispose()",
            "}"
        ];
        for (var i = 0; i < jobs.length; i++) {
            lines.push("Rotate-One " + psQuote(jobs[i].file.fsName) + " " + jobs[i].degrees);
        }

        var stamp  = (new Date()).getTime();
        var ps1    = writeTempFile("id-proof-rotate-" + stamp, ".ps1", lines.join("\r\n") + "\r\n");
        var powershellArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File';

        try {
            try {
                // Deliberately a single VBScript statement: a bare CR is not
                // a reliable line separator for the VBScript engine.
                app.doScript(
                    'CreateObject("WScript.Shell").Run "powershell ' + powershellArgs +
                    ' ""' + ps1.fsName + '""", 0, True',
                    ScriptLanguage.VISUAL_BASIC
                );
                return;
            } catch (vbError) {
                // VBScript unavailable or blocked -- fall through to the .bat route.
            }

            var flagPath = Folder.temp.fsName + "\\id-proof-rotate-" + stamp + ".done";
            var bat = writeTempFile("id-proof-rotate-" + stamp, ".bat",
                '@echo off\r\n' +
                'powershell ' + powershellArgs + ' "' + ps1.fsName + '"\r\n' +
                'echo done> "' + flagPath + '"\r\n');
            try {
                bat.execute();
                if (!waitForFile(flagPath, ROTATE_TIMEOUT_MS)) {
                    throw new Error("Timed out waiting for the rotation step to finish.");
                }
            } finally {
                try { new File(flagPath).remove(); } catch (e) {}
                try { bat.remove(); } catch (e) {}
            }
        } finally {
            try { ps1.remove(); } catch (e) {}
        }
    }

    function rotateOnMac(jobs) {
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
            try { script.remove(); } catch (e) {}
        }
    }

    function waitForFile(path, timeoutMs) {
        var waited = 0;
        while (waited < timeoutMs) {
            if (new File(path).exists) { return true; }
            $.sleep(250);
            waited += 250;
        }
        return false;
    }

    function writeTempFile(prefix, extension, body) {
        var file = new File(Folder.temp.fsName + "/" + prefix + extension);
        file.encoding = "UTF-8";
        if (!file.open("w")) { throw new Error("Could not write " + file.fsName); }
        file.write(body);
        file.close();
        return file;
    }

    function shellQuote(path) { return "'" + String(path).replace(/'/g, "'\\''") + "'"; }
    function psQuote(path)    { return "'" + String(path).replace(/'/g, "''") + "'"; }

    /* ----------------------------- report ----------------------------- */

    function report(exported, rotated, folder, rotationReported, settings, errors, rotateError) {
        var message = exported.length + " proof" + (exported.length === 1 ? "" : "s") +
                      " exported to:\n" + folder.fsName + "\n\n";

        if (rotateError !== null) {
            message += "The proofs exported, but turning them failed:\n" + rotateError;
        } else if (!settings.autoRotate) {
            message += "Auto-rotate was switched off for this run.";
        } else if (rotated > 0) {
            message += rotated + (rotated === 1 ? " was" : " were") +
                       " laid out upside down and has been turned right way up.";
        } else if (!rotationReported) {
            message += "Heads up: this InDesign version did not report a Rotate Spread View\n" +
                       "angle for anything, so nothing could be turned automatically.\n" +
                       "Run \"Check Spread Rotation\" and see the README for the manual\n" +
                       "\"proofRotation\" label override.";
        } else {
            message += "Nothing was rotated in the layout, so nothing needed turning.\n" +
                       "If a proof is still upside down, save the .indd with\n" +
                       "View > Rotate Spread still set to 180 and run this again.";
        }

        if (errors.length > 0) {
            message += "\n\nThese did not export:\n" + errors.join("\n");
        }

        alert(message, "Export Proofs");
    }

})();
