# Plan in 3D and survey your property

## English

### Edit in either view

Select **Plan**, **3D** or **Split** at the top. The drawing tools, floor controls and inspector work with the active viewport. Switching views keeps your current tool and completed drawing points; release or cancel a drag before switching.

In 3D, primary input edits. Use right-drag or **Look / navigate** to move the camera. **Walk** enables first-person movement; **Orbit** returns to the orbit camera. **First / third person** changes the walking camera. Keyboard movement pauses while you enter measurements.

### Survey your property

1. Open **As-Built Survey**, then **Survey my property**.
2. Set your units, origin, north bearing and height datum.
3. Follow the current mission. **Open mission tool** selects the relevant planning tool. Select an element in either view and choose **Use selected element** to attach a reading to it.
4. Enter the measurement, its units, reference and source. Interior face is the default reference. Add notes and photos as needed.
5. **Record observation** stores evidence. **Preview correction** shows a supported geometry change before you apply it. Applying a correction and recording its evidence form one undoable action.
6. Work through rooms, openings, stairs, fixtures, exterior/site features and review. Pause, reorder or skip a mission with a reason whenever needed. Incomplete observations remain visible.
7. Save your project. **Export survey** creates a portable `.mfsurvey.json` file with the survey and available photos. **Printable report** includes measurements and unresolved work, plus site/roof elevations along the model X and Z axes and vertex coordinate tables in centimetres. Y is height in the floor model. Reports follow the app’s English or Hebrew language. **Save as-built baseline** preserves the captured state through the existing baseline workflow.

Under **Virtual walker checks**, set the body size, step limit and camera clearance for the virtual person you want to test. A zero maximum step prevents stair climbing. These checks never widen doorways or change measured dimensions.

In third-person view, camera clearance also applies at obstacle edges and corners. The camera retracts when obstructed and returns smoothly when the space clears. Changing camera clearance changes this viewing behavior, not the property.

In 3D **Select**, drag the yellow site/roof points along their measured plane. Grid snapping follows the current snap setting; use **Edit** in the survey panel for exact coordinates and elevations. Escape or changing views cancels the preview; releasing commits one undoable edit.

Hold **Shift** while selecting corners in 3D to select several corners. The **Point** tool records the height where you click a wall; changing to 2D keeps that height. Arc drafts stay separate from the property until you finish the arc, and one Undo removes the arc and its host-wall splits.

### Practice and capture

**Practice surveying** opens a separate saved document. Choose a rectangular room, connected irregular rooms, a multilevel property or an exterior/site scenario. **Return to my property** restores your property, view, selection and edit history.

**Capture / import a room** opens the room-capture workflow. Choose two matching reference points to align a scan. The preview shows existing walls in grey, reused segments in green and conflicts in red. A scanned wall can span multiple existing segments; only uncovered lengths are added. Review conflicts before applying. Unlocked straight walls can be split at the amber preview points. The import preserves opening and service positions and flags affected wall readings for rechecking. Corner dimensions and room area/minimum-width checks stay attached. Furniture held against a wall is shown with a dashed outline and stays attached when it fits within one resulting section. Furniture crossing a cut or requiring a locked attachment change needs review. Cuts through openings, locked walls and constraints tied to a whole wall still require separate review. Manual readings remain available when browser AR is unavailable. Native capture setup is described in [native/README.md](../native/README.md).

Before leaving connectivity, use **Prepare for offline use** and wait for it to finish. Save your project and keep a survey export available. Phone camera/AR setup is described in [offline and HTTPS](survey-offline-https.md).

## עברית

### עריכה בתוכנית ובתלת־ממד

בחרו בתצוגת תוכנית, תלת־ממד או מסך מפוצל באמצעות הכפתורים העליונים. כלי השרטוט, בחירת הקומה והמאפיינים פועלים על התצוגה הפעילה. מעבר בין תצוגות שומר את הכלי הפעיל ואת נקודות השרטוט שכבר הושלמו.

בתלת־ממד, הפעולה הראשית עורכת את התוכנית. גרירה בלחצן הימני או מצב ניווט מזיזים את המצלמה. מצב הליכה מאפשר לנוע בתוך הנכס; מצב הקפה מחזיר למצלמה המקיפה אותו. בזמן הקלדת מידות, מקשי התנועה אינם מזיזים את הדמות.

### מדידת הנכס הקיים

1. פתחו את סקר המצב הקיים ובחרו במדידת הנכס שלכם.
2. הגדירו יחידות, נקודת מוצא, כיוון צפון וגובה ייחוס.
3. פעלו לפי המשימה הנוכחית. בחרו קיר, פתח, רהיט או חדר כדי לשייך אליו מדידה.
4. הזינו ערך, יחידות, נקודת ייחוס ומקור מדידה. ברירת המחדל היא הפנים הפנימיות של הקיר. הוסיפו הערות ותמונות לפי הצורך.
5. שמירת תצפית מתעדת את המדידה. תצוגה מקדימה של תיקון מציגה שינוי נתמך לפני החלתו. אפשר לבטל את התיקון ואת רישום המדידה בפעולת ביטול אחת.
6. התקדמו בין מדידת חדרים, פתחים, מדרגות, מתקנים, חוץ ומגרש, ולבסוף בדיקה. אפשר להשהות, לשנות סדר או לדלג עם הסבר. מידע חסר או סותר נשאר גלוי.
7. שמרו את הפרויקט. ייצוא הסקר לקובץ `.mfsurvey.json` כולל את הסקר ואת התמונות הזמינות. הדוח להדפסה כולל מידות ועבודה שטרם הושלמה, חזיתות גג ומגרש לאורך צירי X ו־Z של המודל וטבלאות קואורדינטות בסנטימטרים. Y הוא הגובה במודל הקומה. שפת הדוח תואמת לשפת היישום.

בדיקות ההליכה מתייחסות למידות הדמות הווירטואלית ולהגבלות שהגדרתם. הן אינן מרחיבות פתחים ואינן משנות את המידות שנמדדו. כדי לאפשר טיפוס במדרגות, הגדירו גובה מדרגה מרבי מתאים לדמות.

בתצוגת גוף שלישי, מרווח המצלמה נשמר גם ליד קצוות ופינות של מכשולים. המצלמה מתקרבת לדמות כשיש מכשול וחוזרת בהדרגה למרחק הרגיל כשהמרחב מתפנה. שינוי מרווח המצלמה משפיע על התצוגה בלבד, ולא על מידות הנכס.

במצב בחירה בתלת־ממד, גררו את הנקודות הצהובות של המגרש או הגג לאורך המישור המדוד. לערכי מיקום וגובה מדויקים, השתמשו בעריכה בלוח הסקר. Escape או החלפת תצוגה מבטלים את התצוגה המקדימה; שחרור הגרירה שומר שינוי אחד שניתן לבטל.

### תרגול ועבודה ללא חיבור

מצב התרגול נפתח במסמך נפרד. אפשר לבחור חדר מלבני, חדרים לא סדירים, נכס עם מספר קומות או סקר חוץ ומגרש. החזרה לנכס שלכם משחזרת את הפרויקט, התצוגה, הבחירה והיסטוריית העריכה.

למיזוג סריקה, בחרו שתי נקודות ייחוס תואמות. בתצוגה המקדימה קירות קיימים מוצגים באפור, מקטעים לשימוש חוזר בירוק וסתירות באדום. קיר מהסריקה יכול להשתרע על כמה מקטעים קיימים; רק האורכים החסרים יתווספו. אפשר לפצל קירות ישרים שאינם נעולים בנקודות הכתומות שבתצוגה המקדימה. מיקומי הפתחים והמתקנים נשמרים, ומדידות הקיר המושפעות מסומנות לבדיקה מחדש. מידות בין פינות ובדיקות שטח ורוחב מינימלי של חדר נשמרות. ריהוט המחובר לקיר מוצג בקו מקווקו ונשאר מחובר אם הוא נכנס למקטע אחד לאחר הפיצול. ריהוט החוצה חיתוך או שחיבורו נעול דורש בדיקה. חיתוך דרך פתחים, קירות נעולים ואילוצים התלויים בקיר שלם עדיין דורשים בדיקה נפרדת.

אפשר להזין מידות ידנית גם ללא תמיכה במציאות רבודה. לפני עבודה ללא חיבור, הפעילו הכנה לעבודה לא מקוונת והמתינו לסיום. שמרו גם את הפרויקט וגם קובץ ייצוא של הסקר.

בבחירת פינות בתלת־ממד, החזיקו **Shift** כדי לבחור כמה פינות. כלי הנקודה שומר את גובה הלחיצה על הקיר גם במעבר לדו־ממד. טיוטת קשת אינה משנה את הנכס עד להשלמתה; ביטול פעולה אחד מסיר את הקשת ואת פיצולי הקירות המארחים שלה.
