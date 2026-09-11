package local.modelforge.survey

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.view.MotionEvent
import android.widget.*
import androidx.core.content.FileProvider
import com.google.ar.core.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class MainActivity : Activity(), GLSurfaceView.Renderer {
    private lateinit var doc: JSONObject
    private lateinit var column: LinearLayout
    private lateinit var status: TextView
    @Volatile private var session: Session? = null
    @Volatile private var captureGeneration=0
    private var surface: GLSurfaceView? = null
    private var texture = 0
    private var program = 0
    private var tap: Pair<Float,Float>? = null
    private val corners = mutableListOf<JSONObject>()
    private val samples = mutableListOf<FloatArray>()
    @Volatile private var planeEvidence = JSONArray()
    private var stage = 0
    private val stages = arrayOf("Reference and height datum", "Room outline and diagonals", "Openings and headroom", "Stairs and levels", "Fixtures and services", "Exterior, roof and site", "Review unresolved readings")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.systemUiVisibility=android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        doc = try { JSONObject(android.util.AtomicFile(File(filesDir,"recovery.json")).openRead().bufferedReader().use { it.readText() }) } catch (_: Exception) { JSONObject().put("format","ModelForge.Survey").put("version",1).put("units","cm").put("sourceId",UUID.randomUUID().toString()).put("geometry",JSONObject().put("nodes",JSONArray()).put("walls",JSONArray()).put("openings",JSONArray()).put("items",JSONArray()).put("surveyFeatures",JSONArray())).put("survey",JSONObject().put("enabled",true).put("observations",JSONArray()).put("captures",JSONArray()).put("photos",JSONArray())).put("attachments",JSONArray()) }
        home()
    }
    private fun change(action: () -> Unit) {
        val previous=doc.toString()
        val file=android.util.AtomicFile(File(filesDir,"recovery.json"))
        var output: java.io.FileOutputStream? = null
        try { action();output=file.startWrite();output.write(doc.toString().toByteArray(Charsets.UTF_8));file.finishWrite(output) }
        catch(error:Exception) { file.failWrite(output);doc=JSONObject(previous);throw error }
    }
    private fun tr(text:String):String = if(resources.configuration.locales[0].language in listOf("he","iw")) mapOf(
      "Grant camera access, then open capture. Manual surveying remains available." to "אפשרו גישה למצלמה ופתחו שוב את הסריקה. אפשר להמשיך למדוד ידנית.",
      "Enter a measurement or an explanation" to "הזינו מדידה או הסבר", "Could not save survey" to "לא ניתן לשמור את הסקר", "Could not complete capture" to "לא ניתן להשלים את הסריקה",
      "No complete corner loop to recover" to "אין מסלול פינות מלא לשחזור", "No readings yet" to "טרם נשמרו מדידות", "Share survey" to "שיתוף סקר", "Photo unavailable" to "התמונה אינה זמינה",
      "Choose a photo smaller than 30 MB" to "בחרו תמונה קטנה מ־30 מגה־בייט", "Capture at least three stable corners" to "מדדו לפחות שלוש פינות יציבות",
      "Room saved with measured angles. Heights and thicknesses require manual verification." to "החדר נשמר עם הזוויות שנמדדו. יש לבדוק ידנית גבהים ועוביים.",
      "Tracking lost. Move slowly to recover before capturing." to "המעקב אבד. זוזו לאט לחידוש המעקב לפני המשך הסריקה.",
      "Capture interrupted. Return to manual measurements or restart capture." to "הסריקה נקטעה. חזרו למדידות ידניות או התחילו סריקה מחדש.",
      "Camera unavailable. Manual survey remains saved." to "המצלמה אינה זמינה. המדידות הידניות נשמרו.",
      "corners" to "פינות", "Aim screen centre at the next floor/wall corner." to "כוונו את מרכז המסך לפינה הבאה שבין הרצפה לקיר.",
      "As-Built Survey · saved on this device" to "מדידת מצב קיים · נשמר במכשיר זה",
      "Reference and height datum" to "נקודות ייחוס וגובה", "Room outline and diagonals" to "קווי מתאר ואלכסונים", "Openings and headroom" to "פתחים וגובה פנוי", "Stairs and levels" to "מדרגות ומפלסים", "Fixtures and services" to "מתקנים ותשתיות", "Exterior, roof and site" to "חוץ, גג ומגרש", "Review unresolved readings" to "בדיקת מדידות שלא נפתרו",
      "Feature and location" to "הפרט ומיקומו", "Centimetres · interior face" to "סנטימטרים · פאה פנימית", "Reference walls, bearing or inaccessible detail" to "קירות ייחוס, כיוון או פרט שאינו נגיש", "Save manual reading" to "שמירת מדידה ידנית", "Undo last reading" to "ביטול המדידה האחרונה", "Capture room corners with AR" to "סריקת פינות חדר במציאות רבודה", "Add survey photo" to "הוספת תמונה", "Review readings" to "בדיקת מדידות", "Share portable survey" to "שיתוף קובץ מדידה", "Review interrupted capture" to "בדיקת סריקה שנקטעה", "Undo corner" to "ביטול פינה", "Review and finish room" to "בדיקה וסיום חדר", "Pause / return to measurements" to "השהיה וחזרה למדידות", "Reading saved for review" to "המדידה נשמרה לבדיקה", "Last reading removed" to "המדידה האחרונה הוסרה", "Photo saved" to "התמונה נשמרה", "Hold still over the corner before tapping." to "החזיקו את המכשיר יציב מעל הפינה לפני לחיצה."
    )[text] ?: text else text
    private fun message(text:String) { runOnUiThread { status.text=tr(text) } }
    private fun button(text:String, action:()->Unit) { column.addView(Button(this).apply { this.text=tr(text);setOnClickListener { try { action() } catch(e:Exception) { message(if(e is java.io.IOException) "Could not save survey" else e.localizedMessage ?: "Could not complete capture") } } }) }
    private fun field(hint:String)=EditText(this).also { it.hint=tr(hint);column.addView(it) }
    private fun home() {
        val scroll=ScrollView(this).apply { fitsSystemWindows=true };column=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(20,24,20,24) };scroll.addView(column);setContentView(scroll)
        status=TextView(this).apply { text=tr("As-Built Survey · saved on this device") };column.addView(status)
        column.addView(Spinner(this).apply { adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,stages.map { tr(it) });setSelection(stage);onItemSelectedListener=object:AdapterView.OnItemSelectedListener { override fun onNothingSelected(p:AdapterView<*>?) {};override fun onItemSelected(p:AdapterView<*>?,v:android.view.View?,i:Int,id:Long){stage=i} } })
        val name=field("Feature and location"); val value=field("Centimetres · interior face").apply { inputType=android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL or android.text.InputType.TYPE_NUMBER_FLAG_SIGNED }; val note=field("Reference walls, bearing or inaccessible detail")
        button("Save manual reading") {
            val n=value.text.toString().takeIf { it.isNotBlank() }?.toDoubleOrNull()
            require((value.text.isBlank()||n?.isFinite()==true) && (n!=null||note.text.isNotBlank())) { "Enter a measurement or an explanation" }
            val row=JSONObject().put("id",UUID.randomUUID().toString()).put("missionId","native-$stage").put("field",name.text.toString()).put("unit","cm").put("reference","interior").put("source","manual").put("status","entered").put("note",note.text.toString()).put("at",System.currentTimeMillis());if(n!=null)row.put("value",n)
            change { doc.getJSONObject("survey").getJSONArray("observations").put(row) };message("Reading saved for review");value.setText("")
        }
        button("Undo last reading") { change { val rows=doc.getJSONObject("survey").getJSONArray("observations");if(rows.length()>0)rows.remove(rows.length()-1) };message("Last reading removed") }
        button("Review interrupted capture") { val draft=doc.getJSONObject("survey").optJSONArray("captureDraft");require(draft!=null&&draft.length()>=3) { "No complete corner loop to recover" };corners.clear();for(i in 0 until draft.length())corners.add(draft.getJSONObject(i));finishRoom() }
        button("Capture room corners with AR") { startCapture() }
        button("Add survey photo") { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE),7) }
        button("Review readings") { val rows=doc.getJSONObject("survey").getJSONArray("observations");message((0 until rows.length()).joinToString("\n") { val r=rows.getJSONObject(it);"${r.optString("field")}: ${r.optString("value")} cm · ${r.optString("note")}" }.ifBlank { "No readings yet" }) }
        button("Share portable survey") { val dir=File(cacheDir,"exports").apply { mkdirs() };val f=File(dir,"property.mfsurvey.json");f.writeText(doc.toString(2));val uri=FileProvider.getUriForFile(this,"$packageName.files",f);startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),tr("Share survey"))) }
    }
    @Deprecated("Activity result callback") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode==7&&resultCode==RESULT_OK) try {
            val bytes=data?.data?.let { contentResolver.openInputStream(it)?.use { stream->val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(true){val count=stream.read(buffer);if(count<0)break;require(output.size()+count<=30000000) { "Choose a photo smaller than 30 MB" };output.write(buffer,0,count)};output.toByteArray() } } ?: return
            require(bytes.size<=30000000) { "Choose a photo smaller than 30 MB" }
            val bitmap=android.graphics.BitmapFactory.decodeByteArray(bytes,0,bytes.size) ?: return
            val output=java.io.ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,80,output);bitmap.recycle()
            val id=UUID.randomUUID().toString();change { doc.getJSONArray("attachments").put(JSONObject().put("id",id).put("name","Survey photo").put("data","data:image/jpeg;base64,"+android.util.Base64.encodeToString(output.toByteArray(),android.util.Base64.NO_WRAP)))
            doc.getJSONObject("survey").getJSONArray("photos").put(JSONObject().put("id",id).put("attachmentId",id).put("name","Survey photo").put("mimeType","image/jpeg")) };message("Photo saved")
        } catch(e:Exception) { message(e.localizedMessage ?: "Photo unavailable") }
    }
    private fun startCapture() {
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.CAMERA),8);message("Grant camera access, then open capture. Manual surveying remains available.");return }
        if(ArCoreApk.getInstance().requestInstall(this,true)==ArCoreApk.InstallStatus.INSTALL_REQUESTED)return
        session=Session(this).also { s->s.configure(Config(s).apply { planeFindingMode=Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL; if(s.isDepthModeSupported(Config.DepthMode.AUTOMATIC))depthMode=Config.DepthMode.AUTOMATIC }) }
        captureGeneration++;corners.clear();samples.clear();planeEvidence=JSONArray()
        val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;fitsSystemWindows=true };column=layout;setContentView(layout)
        surface=GLSurfaceView(this).apply { setEGLContextClientVersion(2);preserveEGLContextOnPause=true;setRenderer(this@MainActivity);setOnTouchListener { _,e->if(e.action==MotionEvent.ACTION_UP)tap=Pair(e.x,e.y);true } }
        val cameraFrame=FrameLayout(this);cameraFrame.addView(surface,FrameLayout.LayoutParams(-1,-1));cameraFrame.addView(TextView(this).apply { text="+";textSize=36f;setTextColor(android.graphics.Color.WHITE);gravity=android.view.Gravity.CENTER },FrameLayout.LayoutParams(-1,-1));layout.addView(cameraFrame,LinearLayout.LayoutParams(-1,0,1f));status=TextView(this);layout.addView(status)
        button("Undo corner") { if(corners.isNotEmpty()){val previous=corners.toList();try { corners.removeAt(corners.lastIndex);change { doc.getJSONObject("survey").put("captureDraft",JSONArray(corners)) } }catch(error:Exception){corners.clear();corners.addAll(previous);throw error}};surface?.queueEvent { samples.clear() };message("${corners.size} ${tr("corners")}") }
        button("Review and finish room") { finishRoom() }
        button("Pause / return to measurements") { captureGeneration++;surface?.onPause();session?.pause();session?.close();session=null;surface=null;home() }
        session?.resume();surface?.onResume()
    }
    private fun finishRoom() {
        require(corners.size>=3) { "Capture at least three stable corners" }
        val nodes=JSONArray(corners.map { JSONObject().put("x",it.getDouble("x")).put("z",it.getDouble("z")) })
        val id=UUID.randomUUID().toString();val walls=JSONArray(corners.indices.map { JSONObject().put("id","$id-$it").put("a",it).put("b",(it+1)%corners.size).put("height",270).put("thickness",10) })
        val geometry=JSONObject().put("nodes",nodes).put("walls",walls).put("openings",JSONArray()).put("items",JSONArray()).put("surveyFeatures",JSONArray())
        change { doc.getJSONObject("survey").getJSONArray("captures").put(JSONObject().put("id",id).put("source","ARCore corners").put("surfaces",planeEvidence).put("units","cm").put("original",JSONArray(corners)).put("geometry",geometry).put("note","Wall height and thickness are estimates. Measure and verify them."))
        doc.put("geometry",geometry);doc.getJSONObject("survey").remove("captureDraft") };captureGeneration++;surface?.onPause();session?.pause();session?.close();session=null;surface=null;corners.clear();home();message("Room saved with measured angles. Heights and thicknesses require manual verification.")
    }
    override fun onSurfaceCreated(gl:GL10?,config:EGLConfig?) {
        val ids=IntArray(1);GLES20.glGenTextures(1,ids,0);texture=ids[0];GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,texture)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,GLES20.GL_TEXTURE_MIN_FILTER,GLES20.GL_LINEAR);GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,GLES20.GL_TEXTURE_MAG_FILTER,GLES20.GL_LINEAR)
        fun shader(type:Int,source:String):Int { val id=GLES20.glCreateShader(type);GLES20.glShaderSource(id,source);GLES20.glCompileShader(id);return id }
        program=GLES20.glCreateProgram();GLES20.glAttachShader(program,shader(GLES20.GL_VERTEX_SHADER,"attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){v=uv;gl_Position=vec4(p,0.,1.);}"));GLES20.glAttachShader(program,shader(GLES20.GL_FRAGMENT_SHADER,"#extension GL_OES_EGL_image_external : require\nprecision mediump float;uniform samplerExternalOES camera;varying vec2 v;void main(){gl_FragColor=texture2D(camera,v);}"));GLES20.glLinkProgram(program)
    }
    override fun onSurfaceChanged(gl:GL10?,w:Int,h:Int) { GLES20.glViewport(0,0,w,h);session?.setDisplayGeometry(windowManager.defaultDisplay.rotation,w,h) }
    override fun onDrawFrame(gl:GL10?) {
        val s=session ?: return
        val generation=captureGeneration
        try {
            s.setCameraTextureName(texture);val frame=s.update()
            val points=floatArrayOf(-1f,-1f,1f,-1f,-1f,1f,1f,1f)
            fun buffer(a:FloatArray)=ByteBuffer.allocateDirect(a.size*4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(a);position(0) }
            val positions=buffer(points);val uv=buffer(FloatArray(8));frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,positions,Coordinates2d.TEXTURE_NORMALIZED,uv)
            GLES20.glUseProgram(program);GLES20.glActiveTexture(GLES20.GL_TEXTURE0);GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,texture)
            for((name,data) in listOf("p" to positions,"uv" to uv)){val loc=GLES20.glGetAttribLocation(program,name);GLES20.glEnableVertexAttribArray(loc);GLES20.glVertexAttribPointer(loc,2,GLES20.GL_FLOAT,false,0,data)}
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP,0,4)
            if(frame.camera.trackingState!=TrackingState.TRACKING){samples.clear();tap=null;message("Tracking lost. Move slowly to recover before capturing.");return}
            val view=surface ?: return
            val hit=frame.hitTest(view.width/2f,view.height/2f).firstOrNull { val p=it.trackable;p is Plane&&p.type==Plane.Type.HORIZONTAL_UPWARD_FACING&&p.isPoseInPolygon(it.hitPose) }
            if(hit==null){samples.clear();tap=null;return}
            planeEvidence=JSONArray(s.getAllTrackables(Plane::class.java).filter { it.trackingState==TrackingState.TRACKING&&it.subsumedBy==null }.take(200).map { plane->val polygon=plane.polygon;val pts=JSONArray();for(i in 0 until polygon.limit()/2){val xyz=plane.centerPose.transformPoint(floatArrayOf(polygon.get(i*2),0f,polygon.get(i*2+1)));pts.put(JSONObject().put("x",xyz[0]*100).put("y",xyz[1]*100).put("z",xyz[2]*100))};JSONObject().put("points",pts).put("status","estimated").put("orientation",plane.type.toString()) })
            val p=hit.hitPose;samples.add(floatArrayOf(p.tx(),p.ty(),p.tz()));if(samples.size>12)samples.removeAt(0)
            val stable=samples.size>=10&&samples.all { kotlin.math.abs(it[0]-p.tx())<.03&&kotlin.math.abs(it[1]-p.ty())<.03&&kotlin.math.abs(it[2]-p.tz())<.03 }
            if(tap!=null){tap=null;if(stable){val corner=JSONObject().put("x",p.tx()*100).put("y",p.ty()*100).put("z",p.tz()*100);samples.clear();runOnUiThread { if(generation!=captureGeneration||session!==s)return@runOnUiThread;try { change { doc.getJSONObject("survey").put("captureDraft",JSONArray(corners+corner)) };corners.add(corner);message("${corners.size} ${tr("corners")}. ${tr("Aim screen centre at the next floor/wall corner.")}") }catch(error:Exception){message(error.localizedMessage ?: "Could not save survey")} }}else message("Hold still over the corner before tapping.")}
        } catch(_:Exception) { samples.clear();message("Capture interrupted. Return to manual measurements or restart capture.") }
    }
    override fun onPause(){captureGeneration++;surface?.onPause();session?.pause();super.onPause()}
    override fun onResume(){super.onResume();try { session?.resume();surface?.onResume() }catch(_:Exception){message("Camera unavailable. Manual survey remains saved.")}}
    override fun onDestroy(){session?.close();session=null;super.onDestroy()}
}
