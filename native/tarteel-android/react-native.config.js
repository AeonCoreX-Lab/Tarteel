// Tells React Native autolinking how to register this library's package.
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "./android",
        packageImportPath: "import org.tarteel.android.TarteelAndroidPackage;",
        packageInstance: "new TarteelAndroidPackage()",
      },
    },
  },
};
