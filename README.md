# Anglicare Waitara – AR massing (web app)

This web app shows the 25024 Anglicare Waitara massing model in augmented reality. It sits on top of the printed **DA‑100 P06 Ground Floor plan**, which acts as the image tracker. It runs in iPhone Safari and can be saved to the Home Screen. No App Store build is needed.

## How it works
- **Tracking:** MindAR.js (image tracking) runs with three.js, and both libraries are bundled in `lib/` so the app works offline once loaded.
- **Trackers:** the app recognises either the B&W tracker print or the original colour DA‑100 print. Both images, `assets/tracker.png` (B&W) and `assets/tracker_colour.png` (colour), are cropped to the same page area of the DA‑100 sheet (x 60–2040 pt, y 30–1660 pt). `assets/targets.mind` holds both compiled targets.
- **Model:** `assets/model.json` holds every building, level and element of the SketchUp massing (rev. WAC binder) as extruded footprints, in metres.
  - z = 0 is RL 172.00 AHD.
  - The model is registered to the plan with the same transform used to build it (1 pt = 0.0882 m at 1:250), so each building sits on its own footprint.
- **Features:**
  - Level slider that cuts the model by storey.
  - Sun and shadows for Waitara (lat −33.71) on 21 Jun, 21 Mar, 23 Sep and 21 Dec, from 7:00 to 18:00, with true north about 9.4° off the plan's x axis.
  - Tap a building to see its storeys, height and top RL.
  - "3D preview" mode for desktop, or for use without the printed plan.

## Use
1. Print `assets/tracker_A3.pdf` at **A3 landscape, 100% / no scaling**, on matte paper.
2. Open the site in Safari, tap **Share → Add to Home Screen**, then open it from the Home Screen icon.
3. Tap **Start AR camera**, allow camera access, and point at the plan from about 40–60 cm away. Good, even light helps; avoid glare.

## Publish on GitHub Pages (free)
1. Create a new public repository on github.com, e.g. `anglicare-ar`.
2. Upload **all files in this folder**, keeping the folder structure: use *Add file → Upload files* and drag in the folder contents.
3. Go to *Settings → Pages → Build and deployment*, choose *Source: Deploy from a branch*, select *Branch: main / (root)*, and click *Save*.
4. After about a minute the site is live at `https://<your-username>.github.io/anglicare-ar/`. Camera access needs HTTPS, which GitHub Pages provides.

Note: the repository is public, so anyone with the link can view the model. If that matters, rename the repo to something hard to guess. A private repo needs a paid plan for Pages.

## Updating the model or tracker
- **New model:** replace `assets/model.json`, keeping the same format: `[level, building, kind, z0, z1, [[x,y]...]]`.
- **New tracker:** replace `tracker.png` and recompile `targets.mind`. You can use the MindAR online compiler (https://hiukim.github.io/mind-ar-js-doc/tools/compile) or ask Claude to redo it. Also update `scale` and `offset` in `model.json` if the crop changes.
- **After any change:** bump `CACHE` in `sw.js` so phones fetch the new files.
