const { withGradleProperties } = require('expo/config-plugins');

// Prebuild writes org.gradle.jvmargs=-Xmx2048m, which can run out of heap during
// Android release packaging and MapLibre native compilation.
const JVM_ARGS =
  '-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
    );
    props.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: JVM_ARGS,
    });
    config.modResults = props;
    return config;
  });
};
