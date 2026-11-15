/// Converts plain JSON <-> Firestore REST "Value" objects.

Map<String, dynamic> encodeValue(dynamic v) {
  if (v == null) return {'nullValue': null};
  if (v is bool) return {'booleanValue': v};
  if (v is int) return {'integerValue': '$v'};
  if (v is double) {
    if (v.isNaN || v.isInfinite) return {'integerValue': '0'};
    return v == v.truncateToDouble() && v.abs() < 9e15 ? {'integerValue': '${v.toInt()}'} : {'doubleValue': v};
  }
  if (v is String) return {'stringValue': v};
  if (v is DateTime) return {'timestampValue': v.toUtc().toIso8601String()};
  if (v is List) return {'arrayValue': {'values': v.map(encodeValue).toList()}};
  if (v is Map) return {'mapValue': {'fields': encodeFields(v)}};
  return {'stringValue': '$v'};
}

Map<String, dynamic> encodeFields(Map m) => {for (final e in m.entries) '${e.key}': encodeValue(e.value)};

dynamic decodeValue(Map<String, dynamic> v) {
  if (v.containsKey('nullValue')) return null;
  if (v.containsKey('booleanValue')) return v['booleanValue'];
  if (v.containsKey('integerValue')) return int.parse('${v['integerValue']}');
  if (v.containsKey('doubleValue')) return (v['doubleValue'] as num).toDouble();
  if (v.containsKey('stringValue')) return v['stringValue'];
  if (v.containsKey('timestampValue')) return DateTime.parse(v['timestampValue'] as String).millisecondsSinceEpoch;
  if (v.containsKey('arrayValue')) {
    final values = (v['arrayValue'] as Map)['values'] as List?;
    return (values ?? const []).map((e) => decodeValue(Map<String, dynamic>.from(e as Map))).toList();
  }
  if (v.containsKey('mapValue')) {
    return decodeFields(Map<String, dynamic>.from(((v['mapValue'] as Map)['fields'] as Map?) ?? const {}));
  }
  if (v.containsKey('referenceValue')) return v['referenceValue'];
  if (v.containsKey('geoPointValue')) return Map<String, dynamic>.from(v['geoPointValue'] as Map);
  if (v.containsKey('bytesValue')) return v['bytesValue'];
  return null;
}

Map<String, dynamic> decodeFields(Map<String, dynamic> fields) =>
    {for (final e in fields.entries) e.key: decodeValue(Map<String, dynamic>.from(e.value as Map))};
