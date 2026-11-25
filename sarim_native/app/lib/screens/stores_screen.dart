import 'package:flutter/material.dart';
import 'package:sarim_core/sarim_core.dart';

import '../app_state.dart';
import '../format.dart';
import '../ui/theme.dart';

/// Stores with their sale price, formula and production totals (read-only; edit stores in the web app).
class StoresScreen extends StatefulWidget {
  const StoresScreen({super.key, required this.app});
  final AppState app;

  @override
  State<StoresScreen> createState() => _StoresScreenState();
}

class _StoresScreenState extends State<StoresScreen> {
  List<StoreInfo>? _stores;
  Map<String, String> _formulas = {};
  Map<String, ProdTotals> _prod = {};
  int _loadedRevision = -1;

  AppState get app => widget.app;

  @override
  void initState() {
    super.initState();
    app.addListener(_onApp);
    _load();
  }

  @override
  void dispose() {
    app.removeListener(_onApp);
    super.dispose();
  }

  void _onApp() {
    if (app.revision != _loadedRevision) _load();
  }

  Future<void> _load() async {
    _loadedRevision = app.revision;
    final stores = await app.repo.stores();
    final formulas = await app.repo.formulaNames();
    final prod = await app.repo.productionSummary(ProdPeriod.all);
    if (mounted) {
      setState(() {
        _stores = stores;
        _formulas = formulas;
        _prod = {for (final t in prod.byStore) t.store: t};
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final stores = _stores;
    return Scaffold(
      appBar: AppBar(title: const Text('Store Manager')),
      body: stores == null
          ? const Center(child: CircularProgressIndicator())
          : stores.isEmpty
              ? const Center(child: Text('No stores yet. Sync to load them from the cloud.'))
              : ListView(padding: const EdgeInsets.all(12), children: [
                  for (final s in stores)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(s.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                            Text(s.salePrice > 0 ? '${money(s.salePrice)}/kg' : 'No price set',
                                style: TextStyle(fontWeight: FontWeight.w700, color: s.salePrice > 0 ? SarimColors.accent : SarimColors.danger)),
                          ]),
                          const SizedBox(height: 6),
                          Text('Formula: ${s.formulaId.isEmpty ? 'none' : (_formulas[s.formulaId] ?? s.formulaId)}',
                              style: const TextStyle(color: Colors.white60)),
                          if (_prod[s.key] != null)
                            Text(
                              'Produced: ${fmtNum(_prod[s.key]!.net)} kg · ${money(_prod[s.key]!.costPerKg)}/kg cost',
                              style: const TextStyle(color: Colors.white60),
                            ),
                        ]),
                      ),
                    ),
                ]),
    );
  }
}
