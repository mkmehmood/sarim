import 'package:flutter/material.dart';
import 'theme.dart';

/// Stand-in body for a main tab that has not been ported yet.
class TabPlaceholder extends StatelessWidget {
  const TabPlaceholder({super.key, required this.title, required this.icon});
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 48, color: SarimColors.accent),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          const Text('Being ported from the web app', style: TextStyle(color: Colors.white60)),
        ]),
      );
}
