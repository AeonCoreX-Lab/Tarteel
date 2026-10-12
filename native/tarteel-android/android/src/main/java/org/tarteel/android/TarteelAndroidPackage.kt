package org.tarteel.android

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.prayer_times.FullScreenAlarmPackage

/**
 * Single entry point autolinked by React Native. It forwards to the vendored upstream packages,
 * so adding another vendored module is a one-line change here (not a patch to generated code).
 */
class TarteelAndroidPackage : ReactPackage {
  private val delegates: List<ReactPackage> = listOf(
    FullScreenAlarmPackage(),
  )

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    delegates.flatMap { it.createNativeModules(reactContext) }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    delegates.flatMap { it.createViewManagers(reactContext) }
}
