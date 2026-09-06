// Actionable, bilingual help for every issue family emitted by the parametric
// history validator and rebuild pipeline. Unknown future codes get a safe
// generic repair path instead of a bare internal identifier.

const text = (en, he) => ({ en, he });

const CASCADE_CODES = new Set(["unavailable-feature-input"]);

const entries = [
  [["AMBIGUOUS_TARGET", "AMBIGUOUS_ITEM_TARGET"],
    text("The requested operation does not identify one unambiguous target.", "הפעולה המבוקשת אינה מזהה יעד חד־משמעי אחד."),
    text("Choose one specific wall or object, then try again.", "בחרו קיר או אובייקט מסוים אחד ונסו שוב."),
    "show"],
  [["HOST_WALL_NOT_FOUND"],
    text("The wall selected to host this opening no longer exists.", "הקיר שנבחר לאירוח הפתח כבר אינו קיים."),
    text("Choose an existing wall and place the opening again.", "בחרו קיר קיים ומקמו את הפתח מחדש."),
    "show"],
  [["INVALID_HOST_WALL"],
    text("The selected wall cannot host the requested opening.", "הקיר שנבחר אינו יכול לארח את הפתח המבוקש."),
    text("Choose a valid wall with enough usable length, then try again.", "בחרו קיר תקין בעל אורך שמיש מספיק ונסו שוב."),
    "show"],
  [["INVALID_OPENING_TYPE"],
    text("The requested door, window, or passage type is not supported.", "סוג הדלת, החלון או המעבר המבוקש אינו נתמך."),
    text("Choose a supported opening type and try again.", "בחרו סוג פתח נתמך ונסו שוב."),
    "show"],
  [["INVALID_OPENING_VALUE"],
    text("One or more opening dimensions or positions are invalid.", "מידה או מיקום אחד או יותר של הפתח אינם תקינים."),
    text("Correct the opening width, height, sill, or position so it fits on the host wall.", "תקנו את רוחב הפתח, גובהו, הסף או המיקום כך שיתאים לקיר המארח."),
    "show"],
  [["INVALID_ITEM_TYPE", "ITEM_TYPE_NOT_FOUND"],
    text("The requested furniture or equipment type is missing or is not available in the current catalog.", "סוג הריהוט או הציוד המבוקש חסר או אינו זמין בקטלוג הנוכחי."),
    text("Choose an available catalog item, or restore the catalog definition before placing it.", "בחרו פריט זמין בקטלוג, או שחזרו את הגדרת הקטלוג לפני המיקום."),
    "show"],
  [["INVALID_ITEM_POSITION"],
    text("The requested item position or rotation is invalid.", "המיקום או הסיבוב המבוקשים עבור הפריט אינם תקינים."),
    text("Choose a finite plan position and rotation, then try placing the item again.", "בחרו מיקום וסיבוב סופיים בתוכנית ונסו למקם את הפריט שוב."),
    "show"],
  [["INVALID_ITEM_SOURCE", "ITEM_SOURCE_NOT_FOUND"],
    text("One or more source items selected for duplication are missing or invalid.", "פריט מקור אחד או יותר שנבחר לשכפול חסר או אינו תקין."),
    text("Select existing items and try the duplication again.", "בחרו פריטים קיימים ונסו שוב לשכפל."),
    "show"],
  [["ITEM_LOCKED"],
    text("The requested item is locked and cannot be moved.", "הפריט המבוקש נעול ולא ניתן להזיז אותו."),
    text("Unlock the item, then request or perform the move again.", "בטלו את נעילת הפריט ולאחר מכן בקשו או בצעו שוב את ההזזה."),
    "show"],
  [["PERMISSION_DENIED"],
    text("The current layer or work set does not allow this item to move.", "השכבה או קבוצת העבודה הנוכחית אינן מאפשרות להזיז פריט זה."),
    text("Make the item's layer editable or switch to the matching work set, then try again.", "אפשרו עריכה בשכבת הפריט או עברו לקבוצת העבודה המתאימה ונסו שוב."),
    "show"],
  [["ACTIVE_FLOOR_CHANGED"],
    text("The active floor changed after this placement preview was prepared.", "הקומה הפעילה השתנתה לאחר הכנת תצוגת המיקום המקדימה."),
    text("Return to the intended floor and request a fresh preview before confirming the move.", "חזרו לקומה הרצויה ובקשו תצוגה מקדימה חדשה לפני אישור ההזזה."),
    "show"],
  [["PLACEMENT_SERVICE_UNAVAILABLE"],
    text("The current client cannot safely apply item-placement side effects.", "הלקוח הנוכחי אינו יכול להחיל בבטחה את השפעות מיקום הפריט."),
    text("Open the design in the ModelForge planner and request a fresh placement preview there.", "פתחו את התכנון במתכנן ModelForge ובקשו שם תצוגת מיקום מקדימה חדשה."),
    "show"],
  [["PLACEMENT_GEOMETRY_CHANGED"],
    text("A wall or reference item changed after this placement preview was prepared.", "קיר או פריט ייחוס השתנו לאחר הכנת תצוגת המיקום המקדימה."),
    text("Request a fresh ghost preview against the current design before confirming the move.", "בקשו תצוגת רפאים חדשה מול התכנון הנוכחי לפני אישור ההזזה."),
    "show"],
  [["INVALID_ITEM_DIMENSIONS"],
    text("The catalog item has missing or invalid width, depth, or height values.", "לפריט בקטלוג חסרים ערכי רוחב, עומק או גובה תקינים."),
    text("Correct the catalog dimensions so every size is greater than zero, then try again.", "תקנו את מידות הקטלוג כך שכל מידה תהיה גדולה מאפס ונסו שוב."),
    "show"],
  [["ITEM_CREATE_FAILED", "ITEM_DUPLICATE_FAILED"],
    text("The application could not create a valid item instance.", "היישום לא הצליח ליצור מופע פריט תקין."),
    text("Verify the item definition and retry. If it continues, undo the attempted change and reload the project.", "בדקו את הגדרת הפריט ונסו שוב. אם התקלה נמשכת, בטלו את השינוי שנוסה וטענו מחדש את הפרויקט."),
    "show"],
  [["INVALID_WALL_POINT", "ZERO_LENGTH_WALL"],
    text("The requested wall endpoints are invalid or produce a zero-length wall.", "נקודות הקצה המבוקשות של הקיר אינן תקינות או יוצרות קיר באורך אפס."),
    text("Choose two distinct finite points and draw the wall again.", "בחרו שתי נקודות סופיות ונפרדות ושרטטו את הקיר שוב."),
    "show"],
  [["INVALID_WALL_VALUE"],
    text("One or more requested wall properties are invalid.", "מאפיין מבוקש אחד או יותר של הקיר אינו תקין."),
    text("Correct the wall thickness, height, location line, or material values and try again.", "תקנו את עובי הקיר, גובהו, קו המיקום או ערכי החומר ונסו שוב."),
    "show"],
  [["WALL_MATERIALIZATION_FAILED"],
    text("The application could not materialize the requested wall topology.", "היישום לא הצליח ליצור את טופולוגיית הקיר המבוקשת."),
    text("Review the endpoints and nearby joins, then retry or undo the attempted wall creation.", "בדקו את נקודות הקצה והחיבורים הסמוכים, ואז נסו שוב או בטלו את יצירת הקיר שנוסתה."),
    "show"],
  [["INVALID_ROOM_BOUNDS", "ROOM_TOO_SMALL"],
    text("The requested room outline is invalid or too small to create.", "מתאר החדר המבוקש אינו תקין או קטן מדי ליצירה."),
    text("Choose two corners at least 20 cm apart in both directions, then try again.", "בחרו שתי פינות במרחק של לפחות 20 ס״מ בשני הכיוונים ונסו שוב."),
    "show"],
  [["UNKNOWN_PRESET"],
    text("There is no room preset by that name.", "אין חדר מוכן בשם הזה."),
    text("Choose one of the presets the room palette offers, such as bedroom, bathroom or corridor.", "בחרו אחד החדרים המוכנים שמציעה חלונית החדרים, למשל חדר שינה, חדר רחצה או מסדרון."),
    "show"],
  [["INVALID_ROOM_ORIGIN"],
    text("The room has nowhere to go: its centre point is missing or not a number.", "אין לחדר לאן ללכת: נקודת המרכז שלו חסרה או אינה מספר."),
    text("Give the room's centre as x and z in centimetres.", "ציינו את מרכז החדר כ־x ו־z בסנטימטרים."),
    "show"],
  [["ROOM_OVERLAPS"],
    text("A room cannot be placed on top of another one.", "אי אפשר להציב חדר על גבי חדר אחר."),
    text("Move it to clear floor, or up against a wall so the two share it — dropping a room across another subdivides it and both lose their names.", "הזיזו אותו לשטח פנוי, או הצמידו אותו לקיר כך שהשניים יחלקו אותו — הצבת חדר על חדר קיים מפצלת אותו ושניהם מאבדים את שמם."),
    "show"],
  [["ROOM_STAMP_FAILED"],
    text("The room could not be built where it was asked to go.", "לא ניתן היה לבנות את החדר במקום שהתבקש."),
    text("Try a clearer spot or a smaller room; the attempt was rolled back.", "נסו מקום פנוי יותר או חדר קטן יותר; הניסיון בוטל."),
    "show"],
  [["ROOM_WALL_FAILED"],
    text("One of the walls required to close the room could not be created.", "לא ניתן היה ליצור אחד הקירות הדרושים לסגירת החדר."),
    text("Review nearby wall joins and retry the room outline; the failed attempt was rolled back.", "בדקו חיבורי קירות סמוכים ונסו שוב את מתאר החדר; הניסיון שנכשל בוטל."),
    "show"],
  [["INVALID_COMMAND", "INVALID_PLAN", "EMPTY_COMMAND_BATCH"],
    text("The requested operation is missing a valid command or prepared plan.", "בפעולה המבוקשת חסרים פקודה תקינה או תכנון פעולה מוכן."),
    text("Choose a supported action and prepare at least one valid operation before retrying.", "בחרו פעולה נתמכת והכינו לפחות פעולה תקינה אחת לפני ניסיון נוסף."),
    "show"],
  [["PREPARE_FAILED", "VALIDATION_FAILED"],
    text("The operation could not be prepared or did not pass its input checks.", "לא ניתן היה להכין את הפעולה או שהיא לא עברה את בדיקות הקלט."),
    text("Review the requested values and current selection, correct the highlighted input, and retry.", "בדקו את הערכים המבוקשים ואת הבחירה הנוכחית, תקנו את הקלט המסומן ונסו שוב."),
    "show"],
  [["PREVIEW_FAILED"],
    text("The application could not build a safe preview for this operation.", "היישום לא הצליח ליצור תצוגה מקדימה בטוחה לפעולה זו."),
    text("Dismiss the preview, refresh the current view, and request it again before confirming any change.", "סגרו את התצוגה המקדימה, רעננו את התצוגה הנוכחית ובקשו אותה שוב לפני אישור שינוי."),
    "show"],
  [["STALE_DOCUMENT", "PREVIEW_INVALIDATED"],
    text("The design changed after this operation or preview was prepared.", "התכנון השתנה לאחר שהפעולה או התצוגה המקדימה הוכנו."),
    text("Review a fresh preview against the current design, then confirm the operation again.", "בדקו תצוגה מקדימה חדשה מול התכנון הנוכחי ואשרו שוב את הפעולה."),
    "show"],
  [["POST_VALIDATION_FAILED", "EXECUTION_FAILED"],
    text("The operation could not be completed without leaving the design invalid.", "לא ניתן היה להשלים את הפעולה בלי להשאיר את התכנון במצב לא תקין."),
    text("Review the operation inputs and active constraints, then retry with a valid configuration.", "בדקו את קלט הפעולה ואת האילוצים הפעילים ונסו שוב עם תצורה תקינה."),
    "show"],
  [["ROLLBACK_FAILED"],
    text("The failed operation could not restore its starting snapshot automatically.", "הפעולה שנכשלה לא הצליחה לשחזר אוטומטית את תמונת המצב ההתחלתית."),
    text("Stop editing, reload the last saved project or a known history state, and verify the design before continuing.", "הפסיקו לערוך, טענו מחדש את הפרויקט האחרון שנשמר או מצב היסטוריה ידוע ובדקו את התכנון לפני המשך העבודה."),
    "show"],
  [["under-constrained-sketch"],
    text("Some sketch geometry can still move, rotate, or change size.", "חלק מגאומטריית הסקיצה עדיין יכול לזוז, להסתובב או לשנות גודל."),
    text("Edit the sketch and add dimensions or relations until the remaining degrees of freedom reach 0. Fixing one intended point to the origin is often the final step.", "ערכו את הסקיצה והוסיפו מידות או אילוצים עד שמספר דרגות החופש מגיע ל־0. לעיתים קיבוע נקודה אחת למקור הוא השלב האחרון."),
    "edit-sketch"],
  [["over-constrained-sketch"],
    text("Two or more dimensions or relations demand incompatible geometry.", "שתי מידות או אילוצים דורשים גאומטריה שאינה יכולה להתקיים יחד."),
    text("Edit the sketch, inspect the conflicting constraints, then remove, suppress, or convert one duplicate driving dimension to Reference.", "ערכו את הסקיצה, בדקו את האילוצים המתנגשים והסירו, השביתו או הפכו מידה מניעה כפולה למידת ייחוס."),
    "edit-sketch"],
  [["sketch-solve-failed", "sketch-equation", "missing-sketch-parameter"],
    text("The sketch solver cannot evaluate its current geometry, equation, or parameter link.", "פותר הסקיצה אינו יכול לחשב את הגאומטריה, המשוואה או קישור הפרמטר הנוכחיים."),
    text("Edit the sketch, repair disconnected or zero-length geometry, and correct the named equation or missing parameter. Suppress the newest constraint first if the conflict is unclear.", "ערכו את הסקיצה, תקנו גאומטריה מנותקת או באורך אפס ואת המשוואה או הפרמטר החסרים. אם ההתנגשות אינה ברורה, השביתו תחילה את האילוץ החדש ביותר."),
    "edit-sketch"],
  [["invalid-sketch-frame", "invalid-surface-sketch"],
    text("The sketch is attached to an invalid coordinate frame or unsupported curved surface.", "הסקיצה מחוברת למערכת צירים לא תקינה או למשטח מעוקל שאינו נתמך."),
    text("Edit the sketch and reattach it to a valid plane or supported cylindrical, conical, or spherical face.", "ערכו את הסקיצה וחברו אותה מחדש למישור תקין או לפאה גלילית, חרוטית או כדורית נתמכת."),
    "edit-sketch"],
  [["missing-sketch-support-feature", "missing-sketch-reference", "missing-sketch-support"],
    text("The plane, face, datum, or owning feature supporting this sketch no longer exists.", "המישור, הפאה, הייחוס או התכונה התומכים בסקיצה כבר אינם קיימים."),
    text("Repair or unsuppress the earliest failed upstream feature, or edit the sketch and choose a surviving support plane or face.", "תקנו או הפעילו את התכונה הקודמת הראשונה שנכשלה, או ערכו את הסקיצה ובחרו מישור או פאת תמיכה קיימים."),
    "edit-sketch"],
  [["ambiguous-sketch-support"],
    text("Several current faces match the saved sketch support equally well.", "כמה פאות נוכחיות מתאימות באותה מידה לתמיכת הסקיצה השמורה."),
    text("Edit the sketch and explicitly choose the intended current support face.", "ערכו את הסקיצה ובחרו במפורש את פאת התמיכה הנוכחית הרצויה."),
    "edit-sketch"],
  [["sketch-support-rebound"],
    text("The support name changed, but one geometrically matching face was found.", "שם פאת התמיכה השתנה, אך נמצאה פאה אחת תואמת גאומטרית."),
    text("Use Show issue to verify the replacement, then save the model to accept the repaired persistent reference.", "השתמשו ב'הצג בעץ' כדי לבדוק את התחליף, ואז שמרו את המודל כדי לאשר את הייחוס המתוקן."),
    "show"],
  [["missing-topology-reference"],
    text("A selected face or edge was removed or changed too much by an earlier feature.", "פאה או קצה שנבחרו הוסרו או השתנו יותר מדי על ידי תכונה קודמת."),
    text("Edit the feature, remove the missing target, and reselect the intended surviving face or edge. Repair an earlier failed feature first if that geometry should still exist.", "ערכו את התכונה, הסירו את היעד החסר ובחרו מחדש פאה או קצה קיימים. אם הגאומטריה אמורה להתקיים, תקנו קודם תכונה קודמת שנכשלה."),
    "edit-feature"],
  [["ambiguous-topology-reference"],
    text("Several current faces or edges match the old selection equally well.", "כמה פאות או קצוות נוכחיים מתאימים באותה מידה לבחירה הישנה."),
    text("Edit the feature, clear the ambiguous target, and select the exact intended face or edge again.", "ערכו את התכונה, נקו את היעד הדו־משמעי ובחרו מחדש את הפאה או הקצה המדויקים."),
    "edit-feature"],
  [["topology-reference-rebound"],
    text("The persistent name changed, but a unique geometric replacement was found.", "השם הקבוע השתנה, אך נמצא תחליף גאומטרי יחיד."),
    text("Use Show issue to verify the replacement, then save to accept the repaired persistent reference.", "השתמשו ב'הצג בעץ' כדי לבדוק את התחליף, ואז שמרו כדי לאשר את הייחוס המתוקן."),
    "show"],
  [["unavailable-feature-input"],
    text("An earlier feature failed, so this feature has no valid result to consume.", "תכונה קודמת נכשלה ולכן לתכונה זו אין תוצאה תקינה לשימוש."),
    text("Repair or unsuppress the earliest red item above this feature. Downstream features will retry automatically.", "תקנו או הפעילו את הפריט האדום הראשון שמעל תכונה זו. התכונות שאחריו ינסו להיבנות מחדש אוטומטית."),
    "repair-upstream"],
  [["missing-feature-reference", "missing-feature-dependency"],
    text("A required upstream feature was deleted or lost during import.", "תכונה קודמת נדרשת נמחקה או אבדה במהלך ייבוא."),
    text("Restore the deleted source with Undo/history, or edit this feature and select a valid replacement.", "שחזרו את המקור שנמחק באמצעות ביטול/היסטוריה, או ערכו תכונה זו ובחרו תחליף תקין."),
    "edit-feature"],
  [["missing-sketch-dependency"],
    text("The sketch used by this feature was deleted or lost during import.", "הסקיצה המשמשת את התכונה נמחקה או אבדה במהלך ייבוא."),
    text("Restore the deleted sketch, or edit the feature and select a valid closed sketch.", "שחזרו את הסקיצה שנמחקה, או ערכו את התכונה ובחרו סקיצה סגורה תקינה."),
    "edit-feature"],
  [["suppressed-feature-dependency", "suppressed-sketch-dependency"],
    text("This feature depends on an upstream feature or sketch that is suppressed.", "תכונה זו תלויה בתכונה קודמת או בסקיצה שמושבתת."),
    text("Unsuppress the required item, or suppress/delete this dependent feature and its downstream dependants.", "הפעילו את הפריט הנדרש, או השביתו/מחקו את התכונה התלויה ואת התכונות שאחריה."),
    "unsuppress"],
  [["future-feature-dependency", "future-sketch-dependency"],
    text("This feature depends on a feature or sketch positioned later in design history.", "תכונה זו תלויה בתכונה או סקיצה שממוקמת אחריה בהיסטוריית התכן."),
    text("Move the required source earlier in history, or move this feature after its source.", "העבירו את המקור הנדרש מוקדם יותר בהיסטוריה, או את התכונה הזו לאחר המקור."),
    "show"],
  [["feature-cycle"],
    text("The history contains a dependency loop in which features depend on each other.", "ההיסטוריה מכילה לולאת תלות שבה תכונות תלויות זו בזו."),
    text("Use Show issue on the involved features and remove one circular input/reference so history flows only forward.", "הציגו את התכונות המעורבות והסירו קלט או ייחוס מעגלי אחד כך שההיסטוריה תזרום רק קדימה."),
    "show"],
  [["duplicate-feature-id", "feature-without-id", "feature-id", "feature-not-in-history"],
    text("The document contains a damaged or duplicate internal feature identity.", "המסמך מכיל מזהה פנימי פגום או כפול של תכונה."),
    text("Remove and recreate the affected feature through the editor. For imported data, restore the last valid version or re-import the source.", "הסירו וצרו מחדש את התכונה דרך העורך. בנתונים מיובאים, שחזרו את הגרסה התקינה האחרונה או ייבאו מחדש את המקור."),
    "edit-feature"],
  [["missing-history-node"],
    text("The requested design-history step no longer exists.", "שלב היסטוריית התכן המבוקש כבר אינו קיים."),
    text("Refresh the tree and choose an existing step. If it persists, undo the deletion or reopen the last saved version.", "רעננו את העץ ובחרו שלב קיים. אם הבעיה נמשכת, בטלו את המחיקה או פתחו את הגרסה השמורה האחרונה."),
    "show"],
  [["history-node-has-dependants"],
    text("Other features still use this history step.", "תכונות אחרות עדיין משתמשות בשלב היסטוריה זה."),
    text("Delete or redirect the listed dependent features first, then remove this step.", "מחקו או הפנו מחדש תחילה את התכונות התלויות המופיעות, ואז הסירו שלב זה."),
    "show"],
  [["feature-type"],
    text("This document contains a feature type this version cannot rebuild.", "המסמך מכיל סוג תכונה שגרסה זו אינה יכולה לבנות."),
    text("Open the model in a version that supports the feature, or suppress and recreate it with a supported tool.", "פתחו את המודל בגרסה התומכת בתכונה, או השביתו וצרו אותה מחדש בכלי נתמך."),
    "show"],
  [["missing-feature-input"],
    text("The feature does not have all required sketches, bodies, or references.", "לתכונה חסרים סקיצות, גופים או ייחוסים נדרשים."),
    text("Edit the feature and supply the missing selection shown in its definition panel.", "ערכו את התכונה וספקו את הבחירה החסרה המוצגת בלוח ההגדרה."),
    "edit-feature"],
  [["too-many-feature-inputs"],
    text("The feature has more selected inputs than its operation accepts.", "לתכונה יש יותר קלטים נבחרים ממה שהפעולה מקבלת."),
    text("Edit the feature and remove extra selections until its selection counter is valid.", "ערכו את התכונה והסירו בחירות עודפות עד שמונה הבחירות תקין."),
    "edit-feature"],
  [["wrong-reference-kind"],
    text("A selection is the wrong kind, such as a face where an axis is required.", "סוג הבחירה שגוי, למשל פאה במקום ציר."),
    text("Edit the feature and replace that selection with the type requested beside the field.", "ערכו את התכונה והחליפו את הבחירה בסוג המבוקש המוצג ליד השדה."),
    "edit-feature"],
  [["invalid-feature-parameter", "feature-parameter-below-minimum", "feature-parameter-above-maximum", "feature-parameter-not-integer"],
    text("A feature value is invalid, outside its allowed range, or needs to be a whole number.", "ערך בתכונה אינו תקין, מחוץ לטווח המותר או חייב להיות מספר שלם."),
    text("Edit the feature and correct the named field using its displayed minimum, maximum, step, or offered choices.", "ערכו את התכונה ותקנו את השדה המצוין לפי המינימום, המקסימום, הצעד או האפשרויות המוצגים."),
    "edit-feature"],
  [["invalid-end-condition"],
    text("The saved extrusion extent is not supported.", "סוג הסיום השמור של האקסטרוד אינו נתמך."),
    text("Edit the feature and choose Blind, Through all, Up to next, Up to face, or Mid-plane.", "ערכו את התכונה ובחרו עיוור, דרך הכול, עד הבא, עד פאה או מישור אמצע."),
    "edit-feature"],
  [["invalid-boolean-operation"],
    text("The Boolean operation is not Union, Subtract, or Intersect.", "הפעולה הבוליאנית אינה איחוד, חיסור או חיתוך."),
    text("Edit the feature and select Union, Subtract, or Intersect.", "ערכו את התכונה ובחרו איחוד, חיסור או חיתוך."),
    "edit-feature"],
  [["feature-rebuild-failed"],
    text("The geometry kernel rejected this feature's current shape or values.", "מנוע הגאומטריה דחה את הצורה או הערכים הנוכחיים של התכונה."),
    text("Repair earlier red features first. Then edit this feature and simplify its selections or reduce its radius, thickness, draft, or other size.", "תקנו קודם תכונות אדומות קודמות. לאחר מכן ערכו תכונה זו ופשטו את הבחירות או הקטינו רדיוס, עובי, שיפוע או מידה אחרת."),
    "edit-feature"],
  [["parameter-below-minimum", "parameter-above-maximum"],
    text("A document parameter is outside its allowed range.", "פרמטר במסמך מחוץ לטווח המותר."),
    text("Set the named parameter inside its displayed minimum and maximum, or correct the formula driving it.", "הגדירו את הפרמטר המצוין בתוך המינימום והמקסימום המוצגים, או תקנו את הנוסחה שמניעה אותו."),
    "edit-parameters"],
  [["parameter-expression"],
    text("A parameter formula cannot be evaluated.", "לא ניתן לחשב נוסחת פרמטר."),
    text("Open Parameters/Equations and correct the named formula, missing name, or circular dependency.", "פתחו פרמטרים/משוואות ותקנו את הנוסחה, השם החסר או התלות המעגלית."),
    "edit-parameters"],
  [["unknown-override"],
    text("A placed instance overrides a parameter that the model no longer defines.", "מופע ממוקם עוקף פרמטר שהמודל כבר אינו מגדיר."),
    text("Remove the stale instance override, or add the intended parameter back to the model.", "הסירו את עקיפת המופע הישנה, או הוסיפו מחדש את הפרמטר הרצוי למודל."),
    "edit-parameters"],
  [["missing-definition", "missing-id", "missing-origin", "missing-history", "missing-parameters"],
    text("The document is missing a required identity, origin, history, or parameter table.", "במסמך חסרים מזהה, ראשית, היסטוריה או טבלת פרמטרים נדרשים."),
    text("Reopen the last saved version, or start a new part and copy the surviving sketches and features across.", "פתחו מחדש את הגרסה השמורה האחרונה, או התחילו חלק חדש והעתיקו אליו סקיצות ותכונות ששרדו."),
    "show"],
];

const byCode = new Map();
entries.forEach(([codes, meaning, fix, action]) => codes.forEach((code) => byCode.set(code, { meaning, fix, action })));
const fallback = {
  meaning: text("The model could not fully validate or rebuild this item.", "לא ניתן היה לאמת או לבנות מחדש פריט זה במלואו."),
  fix: text("Use Show issue, repair the earliest red item in the tree, then rebuild. Open the feature or sketch editor to review highlighted fields and selections.", "השתמשו ב'הצג בעץ', תקנו את הפריט האדום הראשון ובנו מחדש. פתחו את עורך התכונה או הסקיצה כדי לבדוק שדות ובחירות מודגשים."),
  action: "show",
};

function firstSentence(value) {
  const textValue = String(value || "").trim();
  const match = textValue.match(/^[^.!?]+[.!?]?/);
  return (match ? match[0] : textValue).trim();
}

function lookup(issue = {}) {
  return byCode.get(String(issue.code || "")) || fallback;
}

export function hasDiagnosticHelp(code) {
  return byCode.has(String(code || ""));
}

export function diagnosticAction(issue = {}) {
  const mapped = lookup(issue).action;
  if (mapped) return mapped;
  if (issue.sketchId) return "edit-sketch";
  if (issue.featureId) return "edit-feature";
  if (issue.parameter) return "edit-parameters";
  return "show";
}

export function diagnosticHelp(issue = {}, language = "en") {
  const lang = language === "he" ? "he" : "en";
  const help = lookup(issue);
  const meaning = help.meaning[lang];
  const fix = help.fix[lang];
  return { meaning, fix, next: firstSentence(fix), action: diagnosticAction(issue) };
}

export function diagnosticOwnerId(issue = {}) {
  return issue.sketchId || issue.featureId || issue.parameter || "";
}

export function isCascadeDiagnostic(issue = {}) {
  return CASCADE_CODES.has(String(issue.code || ""));
}

export function rankDiagnostics(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  return list.map((issue, index) => ({ issue, index })).sort((a, b) => {
    const errorA = a.issue.severity === "error" ? 0 : 1;
    const errorB = b.issue.severity === "error" ? 0 : 1;
    if (errorA !== errorB) return errorA - errorB;
    const cascadeA = isCascadeDiagnostic(a.issue) ? 1 : 0;
    const cascadeB = isCascadeDiagnostic(b.issue) ? 1 : 0;
    if (cascadeA !== cascadeB) return cascadeA - cascadeB;
    return a.index - b.index;
  }).map((entry) => entry.issue);
}

export function groupDiagnostics(issues = []) {
  const groups = [];
  const seen = new Map();
  rankDiagnostics(issues).forEach((issue) => {
    const key = String(issue.code || "") + "\0" + diagnosticOwnerId(issue);
    if (seen.has(key)) {
      const group = seen.get(key);
      group.count += 1;
      group.issues.push(issue);
      return;
    }
    const group = { issue, count: 1, issues: [issue] };
    seen.set(key, group);
    groups.push(group);
  });
  return groups;
}

export function recommendedDiagnostic(issues = []) {
  const group = groupDiagnostics(issues)[0];
  return group ? group.issue : null;
}

export const DIAGNOSTIC_CODES = Object.freeze([...byCode.keys()]);
