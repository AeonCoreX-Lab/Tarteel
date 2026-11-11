package org.tarteel.android

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions

/**
 * On-device machine translation with Google ML Kit (Tarteel's own code; nothing vendored). The text being translated stays on the
 * phone. The only network use is ML Kit downloading a language pack (about 30 MB) when `prepare` is called, which JavaScript does
 * only after the person agreed. Language codes are BCP-47 tags ("ar", "en", "bn").
 */
class TarteelTranslateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val translators = HashMap<String, Translator>()

  override fun getName(): String = "TarteelTranslate"

  @Synchronized
  private fun translatorFor(from: String, to: String): Translator {
    return translators.getOrPut("$from>$to") {
      Translation.getClient(
        TranslatorOptions.Builder().setSourceLanguage(from).setTargetLanguage(to).build()
      )
    }
  }

  /** Language tags whose packs are on the device. */
  @ReactMethod
  fun downloaded(promise: Promise) {
    RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel::class.java)
      .addOnSuccessListener { models ->
        val out = Arguments.createArray()
        models.forEach { out.pushString(it.language) }
        promise.resolve(out)
      }
      .addOnFailureListener { promise.reject("failed", it.message, it) }
  }

  /** Makes sure the packs for from to to are on the device, downloading what is missing. */
  @ReactMethod
  fun prepare(from: String, to: String, wifiOnly: Boolean, promise: Promise) {
    val f = TranslateLanguage.fromLanguageTag(from)
    val t = TranslateLanguage.fromLanguageTag(to)
    if (f == null || t == null) {
      promise.reject("unavailable", "Unsupported language")
      return
    }
    val builder = DownloadConditions.Builder()
    if (wifiOnly) builder.requireWifi()
    translatorFor(f, t).downloadModelIfNeeded(builder.build())
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { promise.reject("download-failed", it.message, it) }
  }

  /** Translates one short piece of text. Fails if the packs have not been prepared. */
  @ReactMethod
  fun translate(text: String, from: String, to: String, promise: Promise) {
    val f = TranslateLanguage.fromLanguageTag(from)
    val t = TranslateLanguage.fromLanguageTag(to)
    if (f == null || t == null) {
      promise.reject("unavailable", "Unsupported language")
      return
    }
    translatorFor(f, t).translate(text)
      .addOnSuccessListener { promise.resolve(it) }
      .addOnFailureListener { promise.reject("failed", it.message, it) }
  }

  /** Deletes one language pack. */
  @ReactMethod
  fun remove(lang: String, promise: Promise) {
    val l = TranslateLanguage.fromLanguageTag(lang)
    if (l == null) {
      promise.reject("unavailable", "Unsupported language")
      return
    }
    RemoteModelManager.getInstance().deleteDownloadedModel(TranslateRemoteModel.Builder(l).build())
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { promise.reject("failed", it.message, it) }
  }
}

class TarteelTranslatePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(TarteelTranslateModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
